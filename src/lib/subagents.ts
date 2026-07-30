/**
 * Subagent / Team runtime 派生纯函数 —— 对齐 WorkBuddy
 * `session:getSubagentList` / `getTeamRuntime` / `team-runtime`。
 *
 * OpenBuddy 的 grok 内核通过 `spawn_subagent` 工具调用派生子 agent。这里从会话消息的
 * tool_call 中派生出「子 agent 活动列表」,并支持把 RunningTask(后台任务)合并展示。
 * 纯函数、无副作用,便于单测。
 */
import type { ChatMessage, ToolCallView } from "@/stores/session-store";
import type { RunningTask } from "@/lib/types";

/** 子 agent 活动条目。 */
export interface SubagentActivity {
  /** toolCallId(去重 key)。 */
  id: string;
  /** 子 agent 名称/描述(从 title 解析)。 */
  name: string;
  /** 状态(继承 tool_call status)。 */
  status: "in_progress" | "completed" | "failed";
  /** 是否为 spawn_subagent 工具(否则是其它后台任务)。 */
  isSpawn: boolean;
}

/** 从 tool_call 的 title 解析子 agent 名称。
 *  grok 的 spawn_subagent 标题通常是「Spawn subagent: <name>」或「使用 <name> 执行…」。 */
export function parseSubagentName(title: string): string {
  const t = (title || "").trim();
  let m = t.match(/spawn\s+subagent\s*[:：]\s*(.+)/i);
  if (m?.[1]) return m[1].trim();
  m = t.match(/^(?:使用|用)\s*(.+?)\s*(?:执行|完成|处理)/);
  if (m?.[1]) return m[1].trim();
  return t.length > 40 ? t.slice(0, 40) + "…" : t || "(subagent)";
}

/** 从会话消息派生子 agent 活动列表(去重,保持首次出现顺序)。 */
export function deriveSubagents(messages: ChatMessage[]): SubagentActivity[] {
  const seen = new Set<string>();
  const out: SubagentActivity[] = [];
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.kind !== "tool_call") continue;
      const tc = p.toolCall;
      const isSpawn = isSubagentTool(tc);
      if (!isSpawn) continue;
      if (seen.has(tc.toolCallId)) continue;
      seen.add(tc.toolCallId);
      out.push({
        id: tc.toolCallId,
        name: parseSubagentName(tc.title),
        status: tc.status,
        isSpawn,
      });
    }
  }
  return out;
}

/** 判断一个 tool_call 是否为 spawn_subagent(按 kind 匹配)。 */
export function isSubagentTool(tc: ToolCallView): boolean {
  const k = (tc.kind || "").toLowerCase();
  return k === "spawn_subagent" || k.includes("subagent") || k.includes("spawn");
}

/** 把 RunningTask 列表归一化为 SubagentActivity(统一展示)。 */
export function tasksToActivities(tasks: RunningTask[]): SubagentActivity[] {
  return tasks.map((t) => ({
    id: t.id,
    name: t.description || t.kind || t.id,
    status: taskStatusToToolStatus(t.status),
    isSpawn: false,
  }));
}

/** RunningTask.status(字符串)→ tool_call status。 */
export function taskStatusToToolStatus(
  status?: string,
): "in_progress" | "completed" | "failed" {
  const s = (status || "").toLowerCase();
  if (s.includes("fail") || s.includes("error")) return "failed";
  if (s.includes("done") || s.includes("complete") || s.includes("success")) return "completed";
  return "in_progress";
}

/** 合并去重:subagent 活动 + RunningTask(按 id 去重,subagent 优先)。 */
export function mergeActivities(
  subagents: SubagentActivity[],
  tasks: SubagentActivity[],
): SubagentActivity[] {
  const seen = new Set<string>();
  const out: SubagentActivity[] = [];
  for (const a of [...subagents, ...tasks]) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

/** 统计:返回 { total, running, completed, failed }。 */
export function activityStats(list: SubagentActivity[]): {
  total: number;
  running: number;
  completed: number;
  failed: number;
} {
  return {
    total: list.length,
    running: list.filter((a) => a.status === "in_progress").length,
    completed: list.filter((a) => a.status === "completed").length,
    failed: list.filter((a) => a.status === "failed").length,
  };
}
