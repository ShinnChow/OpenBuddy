import { describe, it, expect } from "vitest";
import {
  detectToolRenderer,
  rendererLabel,
  rendererIcon,
  summarizeTool,
} from "../tool-renderers";
import type { ToolCallView } from "@/stores/session-store";

function tc(kind: string, raw?: unknown, title = "T"): ToolCallView {
  return { toolCallId: "x", title, kind, status: "completed", content: [], rawInput: raw };
}

describe("detectToolRenderer", () => {
  it("command 类", () => {
    expect(detectToolRenderer("run_terminal_command")).toBe("command");
    expect(detectToolRenderer("bash")).toBe("command");
    expect(detectToolRenderer("execute_command")).toBe("command");
  });
  it("edit / read / search", () => {
    expect(detectToolRenderer("edit")).toBe("edit");
    expect(detectToolRenderer("write_file")).toBe("edit");
    expect(detectToolRenderer("read_file")).toBe("read");
    expect(detectToolRenderer("grep")).toBe("read");
    expect(detectToolRenderer("web_search")).toBe("search");
  });
  it("专用渲染器", () => {
    expect(detectToolRenderer("defer_execute")).toBe("defer-execute");
    expect(detectToolRenderer("send_message")).toBe("send-message");
    expect(detectToolRenderer("image_gen")).toBe("image-gen");
    expect(detectToolRenderer("generate_image")).toBe("image-gen");
    expect(detectToolRenderer("visualizer")).toBe("visualizer");
    expect(detectToolRenderer("team_create")).toBe("team-create");
    expect(detectToolRenderer("team_delete")).toBe("team-delete");
    expect(detectToolRenderer("agent_mail")).toBe("agent-mail");
    expect(detectToolRenderer("specialist")).toBe("specialist");
  });
  it("未知 kind → default", () => {
    expect(detectToolRenderer("something_new")).toBe("default");
  });
  it("空 kind → unknown", () => {
    expect(detectToolRenderer("")).toBe("unknown");
  });
});

describe("rendererLabel / rendererIcon", () => {
  it("各渲染器有标签与图标", () => {
    expect(rendererLabel("command")).toBe("终端命令");
    expect(rendererLabel("image-gen")).toBe("图像生成");
    expect(rendererLabel("team-create")).toBe("创建团队");
    expect(rendererLabel("default")).toBe("工具");
    expect(rendererLabel("unknown")).toBe("未知工具");
    expect(typeof rendererIcon("image-gen")).toBe("string");
    expect(rendererIcon("default")).toBe("🔧");
  });
});

describe("summarizeTool", () => {
  it("send-message 提取 message", () => {
    const s = summarizeTool(tc("send_message", { message: "你好,这是通知" }), "send-message");
    expect(s).toContain("你好");
  });
  it("image-gen 提取 prompt", () => {
    const s = summarizeTool(tc("image_gen", { prompt: "一只猫" }), "image-gen");
    expect(s).toContain("一只猫");
    expect(s.startsWith("生成图像:")).toBe(true);
  });
  it("team-create 提取成员数", () => {
    const s = summarizeTool(tc("team_create", { members: [1, 2, 3] }), "team-create");
    expect(s).toContain("3 名成员");
  });
  it("defer-execute 提取命令数", () => {
    const s = summarizeTool(tc("defer_execute", { commands: ["a", "b"] }), "defer-execute");
    expect(s).toContain("2 条命令");
  });
  it("default 回退到 title", () => {
    expect(summarizeTool(tc("read_file", undefined, "读取文件"), "read")).toBe("读取文件");
  });
  it("send-message 无 message 字段回退 title", () => {
    expect(summarizeTool(tc("send_message", {}, "原标题"), "send-message")).toBe("原标题");
  });
  it("image-gen prompt 截断 60 字", () => {
    const long = "x".repeat(80);
    const s = summarizeTool(tc("image_gen", { prompt: long }), "image-gen");
    // 「生成图像:」+ 60 字 = 66
    expect(s.length).toBeLessThanOrEqual(70);
  });
});
