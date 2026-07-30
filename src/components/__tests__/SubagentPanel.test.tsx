import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SubagentPanel } from "../SubagentPanel";
import type { ChatMessage } from "@/stores/session-store";
import type { RunningTask } from "@/lib/types";

function spawnMsg(
  id: string,
  title: string,
  status: "in_progress" | "completed" | "failed",
): ChatMessage {
  return {
    id,
    role: "assistant",
    complete: true,
    parts: [
      {
        kind: "tool_call",
        toolCall: {
          toolCallId: id,
          title,
          kind: "spawn_subagent",
          status,
          content: [],
        },
      },
    ],
  };
}

describe("SubagentPanel", () => {
  it("无 subagent/task 时不渲染", () => {
    const { container } = render(<SubagentPanel messages={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("从 spawn_subagent 派生并展示", () => {
    render(<SubagentPanel messages={[spawnMsg("t1", "Spawn subagent: coder", "completed")]} />);
    expect(screen.getByText("子代理")).toBeInTheDocument();
    expect(screen.getByText("coder")).toBeInTheDocument();
    expect(screen.getByText("已完成")).toBeInTheDocument();
    expect(screen.getByText("spawn")).toBeInTheDocument();
  });

  it("汇总统计(总数/运行中/完成)", () => {
    render(
      <SubagentPanel
        messages={[
          spawnMsg("t1", "Spawn subagent: a", "completed"),
          spawnMsg("t2", "Spawn subagent: b", "in_progress"),
        ]}
      />,
    );
    expect(screen.getByText(/2 个/)).toBeInTheDocument();
    expect(screen.getByText(/运行中 1/)).toBeInTheDocument();
    expect(screen.getByText(/完成 1/)).toBeInTheDocument();
  });

  it("合并 RunningTask 并按来源标记 task", () => {
    const tasks: RunningTask[] = [
      { id: "tk1", description: "后台搜索", status: "running" },
    ];
    render(
      <SubagentPanel
        messages={[spawnMsg("t1", "Spawn subagent: coder", "completed")]}
        tasks={tasks}
      />,
    );
    expect(screen.getByText("后台搜索")).toBeInTheDocument();
    // 两个 source chip:spawn + task
    expect(screen.getAllByText("spawn")).toHaveLength(1);
    expect(screen.getAllByText("task")).toHaveLength(1);
  });

  it("失败统计显示", () => {
    render(<SubagentPanel messages={[spawnMsg("t1", "Spawn subagent: x", "failed")]} />);
    expect(screen.getByText(/失败 1/)).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();
  });
});
