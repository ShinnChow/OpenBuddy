/**
 * 子 agent / 团队运行时面板 —— 对齐 WorkBuddy `team-runtime` /
 * `session:getSubagentList`。
 *
 * 从会话消息派生 spawn_subagent 活动 + 后台 RunningTask,统一展示每个子 agent
 * 的名称、状态(running/completed/failed)、来源(spawn/task)。空时不渲染。
 */
import { useMemo } from "react";
import {
  deriveSubagents,
  tasksToActivities,
  mergeActivities,
  activityStats,
} from "@/lib/subagents";
import type { ChatMessage } from "@/stores/session-store";
import type { RunningTask } from "@/lib/types";

interface SubagentPanelProps {
  messages: ChatMessage[];
  /** 后台任务列表(可选,来自 tasks_list)。 */
  tasks?: RunningTask[];
}

const STATUS_LABEL: Record<string, string> = {
  in_progress: "运行中",
  completed: "已完成",
  failed: "失败",
};

export function SubagentPanel({ messages, tasks }: SubagentPanelProps) {
  const activities = useMemo(() => {
    const subs = deriveSubagents(messages);
    const taskActs = tasksToActivities(tasks ?? []);
    return mergeActivities(subs, taskActs);
  }, [messages, tasks]);
  const stats = useMemo(() => activityStats(activities), [activities]);

  if (activities.length === 0) return null;

  return (
    <div className="subagent-panel" role="region" aria-label="子代理运行时">
      <div className="subagent-panel__head">
        <span className="subagent-panel__title">子代理</span>
        <span className="subagent-panel__summary">
          {stats.total} 个 · 运行中 {stats.running} · 完成 {stats.completed}
          {stats.failed > 0 ? ` · 失败 ${stats.failed}` : ""}
        </span>
      </div>
      <ul className="subagent-panel__list">
        {activities.map((a) => (
          <li
            key={a.id}
            className={"subagent-panel__row subagent-panel__row--" + a.status}
            title={a.id}
          >
            <span className="subagent-panel__dot" />
            <span className="subagent-panel__name">{a.name}</span>
            <span className="subagent-panel__source">
              {a.isSpawn ? "spawn" : "task"}
            </span>
            <span className="subagent-panel__status">{STATUS_LABEL[a.status]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
