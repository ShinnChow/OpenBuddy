//! OpenBuddy 自定义团队工具 —— 通过 `register_tool_pack` 注入 grok。
//!
//! 三个工具:
//! - `create_team` — 创建专家团（验证成员 agent .md 存在于 ~/.grok/agents/）
//! - `team_status` — 查询当前已注册的团队成员
//! - `team_delete` — 解散团队（可选删除成员 agent 文件）
//!
//! LLM 可以像调用 `bash` / `task` 一样直接调用这些工具。

use crate::agents_store::user_agents_dir_pub;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex};
use xai_grok_tools::types::tool::{ToolKind, ToolNamespace};
use xai_grok_tools::types::tool_metadata::ToolMetadata;
use xai_grok_tools::types::tool_io::ToolInput;
use xai_grok_tools::types::output::ToolOutput;
use xai_tool_protocol::{ToolCapabilities, ToolId, ToolScope};
use xai_tool_runtime::error::ToolError;
use xai_tool_runtime::tool::Tool;
use xai_tool_runtime::{ListToolsContext, ToolCallContext};
use xai_tool_types::ToolDescription;

// ---------- 团队状态（进程级，线程安全）----------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamInfo {
    pub team_id: String,
    pub members: Vec<TeamMember>,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMember {
    pub name: String,
    pub file: String,
}

static TEAMS: LazyLock<Mutex<HashMap<String, TeamInfo>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// 进程级守卫：`register_tool_pack` 非幂等（grok 源码 `registry/types.rs` 明确说明
/// 「重复注册会注册两遍工具」）。`spawn_grok` 在 agent 重启（grok_shutdown → grok_init）
/// 时会再次调用本函数，所以用这个 flag 确保整个进程生命周期内只真正注册一次。
static TEAM_TOOLS_REGISTERED: AtomicBool = AtomicBool::new(false);

// ====================================================================
// create_team
// ====================================================================

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateTeamInput {
    #[schemars(description = "Unique team identifier (e.g. 'trading-team')")]
    pub team_id: String,
    #[schemars(description = "Team members. Each member's agent .md must already exist in ~/.grok/agents/.")]
    pub members: Vec<CreateTeamMember>,
    #[schemars(description = "Optional team description")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateTeamMember {
    pub name: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTeamOutput {
    pub team_id: String,
    pub registered_members: Vec<String>,
    pub message: String,
}

impl xai_tool_runtime::render::ToolOutput for CreateTeamOutput {}

// Into<ToolInput> — 序列化为 Dynamic(Value)
impl From<CreateTeamInput> for ToolInput {
    fn from(val: CreateTeamInput) -> Self {
        ToolInput::Dynamic(serde_json::to_value(val).unwrap_or_default())
    }
}

// Into<ToolOutput> — 序列化为 Dynamic(DynamicOutput)
impl From<CreateTeamOutput> for ToolOutput {
    fn from(val: CreateTeamOutput) -> Self {
        ToolOutput::Dynamic(serde_json::to_value(val).unwrap_or_default().into())
    }
}

#[derive(Debug, Default)]
pub struct CreateTeamTool;

impl ToolMetadata for CreateTeamTool {
    fn kind(&self) -> ToolKind { ToolKind::Other }
    fn tool_namespace(&self) -> ToolNamespace { ToolNamespace::GrokBuild }
    fn description_template(&self) -> &str {
        "Create a multi-agent team. Verifies each member's agent .md exists in ~/.grok/agents/. After creation, use the 'task' tool to dispatch subtasks to members by name."
    }
}

impl Tool for CreateTeamTool {
    type Args = CreateTeamInput;
    type Output = CreateTeamOutput;

    fn id(&self) -> ToolId {
        ToolId::new("create_team").expect("valid tool id")
    }

    fn description(&self, _ctx: &ListToolsContext) -> ToolDescription {
        ToolDescription::new("create_team", self.description_template())
    }

    fn capabilities(&self) -> ToolCapabilities {
        ToolCapabilities {
            is_read_only: false,
            tool_scope: Some(ToolScope::Write),
            ..Default::default()
        }
    }

    async fn run(&self, _ctx: ToolCallContext, input: CreateTeamInput) -> Result<CreateTeamOutput, ToolError> {
        let agents_dir = user_agents_dir_pub();
        // 去重 + 校验成员名，避免 LLM 误传带路径分隔符/后缀的名字（会写出 agent 目录外）。
        let mut seen = std::collections::HashSet::new();
        for member in &input.members {
            let name = member.name.trim();
            if name.is_empty() {
                return Err(ToolError::invalid_arguments(
                    "成员名不能为空".to_string(),
                ));
            }
            // 拒绝路径分隔符 / 后缀 / 通配，防止 join 出 agents 目录外。
            if name.contains('/')
                || name.contains('\\')
                || name.contains("..")
                || name.contains('\0')
                || name.ends_with(".md")
            {
                return Err(ToolError::invalid_arguments(
                    format!(
                        "成员名 '{}' 非法：不能包含路径分隔符、'..' 或 '.md' 后缀（请只用纯名称）",
                        name
                    ),
                ));
            }
            if !seen.insert(name.to_string()) {
                return Err(ToolError::invalid_arguments(
                    format!("成员名 '{}' 重复出现，每个成员只能出现一次", name),
                ));
            }
        }

        let mut registered = Vec::new();
        let mut team_members = Vec::new();
        for member in &input.members {
            // 用 trim 后的名字做文件查找与存储（校验已在上一个循环完成）。
            let name = member.name.trim();
            let agent_file = agents_dir.join(format!("{}.md", name));
            if agent_file.is_file() {
                registered.push(name.to_string());
                team_members.push(TeamMember {
                    name: name.to_string(),
                    file: agent_file.to_string_lossy().to_string(),
                });
            } else {
                // 成员名不匹配是团队功能最常见的报错来源：列出目录里实际存在的
                // agent 文件，并给出目录路径，让 LLM / 用户能立刻看到可选成员。
                let available = list_available_agents(&agents_dir);
                let hint = if available.is_empty() {
                    format!(
                        "目录 {} 下还没有任何 agent 定义文件（*.md）。请先在该目录创建成员的 .md 文件。",
                        agents_dir.display()
                    )
                } else {
                    format!(
                        "可用成员: {}。请确认名称完全匹配（区分大小写）。目录: {}",
                        available.join(", "),
                        agents_dir.display()
                    )
                };
                return Err(ToolError::execution(
                    self.id(),
                    format!(
                        "成员 '{}' 的 agent 文件不存在: {}。\n{}",
                        name,
                        agent_file.display(),
                        hint
                    ),
                ));
            }
        }
        let created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        {
            let mut teams = TEAMS.lock().unwrap();
            teams.insert(input.team_id.clone(), TeamInfo {
                team_id: input.team_id.clone(),
                members: team_members,
                created_at,
            });
        }
        // 成功消息里强调：成员名必须与 task 工具的 subagent_type 完全一致，
        // 否则 grok 会返回 "Unknown subagent type"。
        Ok(CreateTeamOutput {
            team_id: input.team_id.clone(),
            message: format!(
                "团队 '{}' 已创建，{} 名成员已就绪: {}。\n\
                 用法: 调用 task 工具时，subagent_type 参数必须填写成员名（完全一致，区分大小写），\
                 例如 {{\"subagent_type\": \"{}\", \"prompt\": \"...\"}}。",
                input.team_id,
                registered.len(),
                registered.join(", "),
                registered.first().cloned().unwrap_or_default()
            ),
            registered_members: registered,
        })
    }
}

// ====================================================================
// team_status
// ====================================================================

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TeamStatusInput {
    #[schemars(description = "Team ID. If omitted, lists all active teams.")]
    pub team_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamStatusOutput {
    pub teams: Vec<TeamInfo>,
}

impl xai_tool_runtime::render::ToolOutput for TeamStatusOutput {}

impl From<TeamStatusInput> for ToolInput {
    fn from(val: TeamStatusInput) -> Self {
        ToolInput::Dynamic(serde_json::to_value(val).unwrap_or_default())
    }
}

impl From<TeamStatusOutput> for ToolOutput {
    fn from(val: TeamStatusOutput) -> Self {
        ToolOutput::Dynamic(serde_json::to_value(val).unwrap_or_default().into())
    }
}

#[derive(Debug, Default)]
pub struct TeamStatusTool;

impl ToolMetadata for TeamStatusTool {
    fn kind(&self) -> ToolKind { ToolKind::Other }
    fn tool_namespace(&self) -> ToolNamespace { ToolNamespace::GrokBuild }
    fn description_template(&self) -> &str {
        "Check the status of agent teams. Returns registered team members and their agent file paths."
    }
}

impl Tool for TeamStatusTool {
    type Args = TeamStatusInput;
    type Output = TeamStatusOutput;

    fn id(&self) -> ToolId {
        ToolId::new("team_status").expect("valid tool id")
    }

    fn description(&self, _ctx: &ListToolsContext) -> ToolDescription {
        ToolDescription::new("team_status", self.description_template())
    }

    fn capabilities(&self) -> ToolCapabilities {
        ToolCapabilities {
            is_read_only: true,
            tool_scope: Some(ToolScope::Read),
            ..Default::default()
        }
    }

    async fn run(&self, _ctx: ToolCallContext, input: TeamStatusInput) -> Result<TeamStatusOutput, ToolError> {
        let teams = TEAMS.lock().unwrap();
        let result = match input.team_id {
            Some(id) => match teams.get(&id) {
                Some(t) => vec![t.clone()],
                None => return Err(ToolError::execution(self.id(), format!("团队 '{}' 不存在", id))),
            },
            None => teams.values().cloned().collect(),
        };
        Ok(TeamStatusOutput { teams: result })
    }
}

// ====================================================================
// team_delete
// ====================================================================

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TeamDeleteInput {
    #[schemars(description = "Team ID to disband")]
    pub team_id: String,
    #[schemars(description = "If true, also delete member agent .md files. Default: false.")]
    pub delete_files: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamDeleteOutput {
    pub team_id: String,
    pub message: String,
}

impl xai_tool_runtime::render::ToolOutput for TeamDeleteOutput {}

impl From<TeamDeleteInput> for ToolInput {
    fn from(val: TeamDeleteInput) -> Self {
        ToolInput::Dynamic(serde_json::to_value(val).unwrap_or_default())
    }
}

impl From<TeamDeleteOutput> for ToolOutput {
    fn from(val: TeamDeleteOutput) -> Self {
        ToolOutput::Dynamic(serde_json::to_value(val).unwrap_or_default().into())
    }
}

#[derive(Debug, Default)]
pub struct TeamDeleteTool;

impl ToolMetadata for TeamDeleteTool {
    fn kind(&self) -> ToolKind { ToolKind::Other }
    fn tool_namespace(&self) -> ToolNamespace { ToolNamespace::GrokBuild }
    fn description_template(&self) -> &str {
        "Disband an agent team. Unregisters team members. Optionally deletes their agent .md files."
    }
}

impl Tool for TeamDeleteTool {
    type Args = TeamDeleteInput;
    type Output = TeamDeleteOutput;

    fn id(&self) -> ToolId {
        ToolId::new("team_delete").expect("valid tool id")
    }

    fn description(&self, _ctx: &ListToolsContext) -> ToolDescription {
        ToolDescription::new("team_delete", self.description_template())
    }

    fn capabilities(&self) -> ToolCapabilities {
        ToolCapabilities {
            is_read_only: false,
            tool_scope: Some(ToolScope::Write),
            ..Default::default()
        }
    }

    async fn run(&self, _ctx: ToolCallContext, input: TeamDeleteInput) -> Result<TeamDeleteOutput, ToolError> {
        let delete_files = input.delete_files.unwrap_or(false);
        let mut teams = TEAMS.lock().unwrap();
        let team = teams.remove(&input.team_id)
            .ok_or_else(|| ToolError::execution(self.id(), format!("团队 '{}' 不存在", input.team_id)))?;
        let mut deleted_count = 0;
        if delete_files {
            for member in &team.members {
                let path = std::path::PathBuf::from(&member.file);
                if path.is_file() && std::fs::remove_file(&path).is_ok() {
                    deleted_count += 1;
                }
            }
        }
        let message = if delete_files {
            format!("团队 '{}' 已解散，{} 个成员 agent 文件已删除。", input.team_id, deleted_count)
        } else {
            format!("团队 '{}' 已解散（成员 agent 文件保留）。", input.team_id)
        };
        Ok(TeamDeleteOutput { team_id: input.team_id, message })
    }
}

// ====================================================================
// 注册函数
// ====================================================================

/// 列出 agents 目录里实际存在的 `*.md` agent 定义文件名（去后缀）。
/// 用于 `create_team` 报错时给 LLM / 用户展示可选项，降低「成员名不匹配 →
/// Unknown subagent type」的概率。
fn list_available_agents(agents_dir: &std::path::Path) -> Vec<String> {
    let mut names = Vec::new();
    if let Ok(entries) = std::fs::read_dir(agents_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("md") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    names.push(stem.to_string());
                }
            }
        }
    }
    names.sort();
    names
}

/// 注册所有 OpenBuddy 团队工具到 grok 的 ToolRegistry。
/// 在 `spawn_grok()` 的最开头调用。
///
/// **幂等**：`register_tool_pack` 本身不幂等（重复调用会把同一批工具注册两遍，
/// 见 grok 源码 `registry/types.rs` 的文档注释）。agent 重启（grok_shutdown →
/// grok_init，例如 `grok://agent-died` 后恢复）会再次走到 `spawn_grok`，所以这里
/// 用进程级 `AtomicBool` 守卫，确保整个进程生命周期内只真正注册一次。
pub fn register_team_tools() {
    if TEAM_TOOLS_REGISTERED.swap(true, Ordering::SeqCst) {
        tracing::debug!("team tools already registered this process — skipping");
        return;
    }
    xai_grok_tools::registry::types::register_tool_pack(|builder| {
        builder.register::<CreateTeamTool>();
        builder.register::<TeamStatusTool>();
        builder.register::<TeamDeleteTool>();
    });
}
