import type { ToolCallView } from "@/stores/session-store";
import type { DiffContent, CommandOutputContent } from "@/lib/types";
import { checkCommandRisk, riskLabel } from "@/lib/command-risk";
import {
  detectToolRenderer,
  rendererLabel,
  rendererIcon,
  summarizeTool,
} from "@/lib/tool-renderers";

type ToolCallCardProps = {
  tc: ToolCallView;
  /** Open the right-side detail drawer (Phase 2). */
  onOpen?: (tc: ToolCallView) => void;
};

/**
 * Compact inline tool-call row (Phase 1 — WorkBuddy `unknown-tool-compact`).
 *
 * Always one line in the transcript: kind + short title + status.
 * Details (command/diff/output) open in the side drawer via `onOpen`.
 */
export function ToolCallCard({ tc, onOpen }: ToolCallCardProps) {
  const statusCls =
    tc.status === "completed"
      ? "toolcall--ok"
      : tc.status === "failed"
        ? "toolcall--err"
        : "toolcall--run";

  const statusLabel =
    tc.status === "completed" ? "完成" : tc.status === "failed" ? "失败" : "运行中";

  const statusMark =
    tc.status === "completed" ? "✓" : tc.status === "failed" ? "!" : "…";

  const shortTitle = shortenTitle(tc.title, tc.kind);

  // 专用渲染器(对齐 WorkBuddy tools/renderers):非 default/unknown 时用图标 +
  // 渲染器标签 + 摘要替代通用 kind 文案。
  const renderer = detectToolRenderer(tc.kind);
  const specialized =
    renderer !== "default" && renderer !== "unknown";
  const kindLabel = specialized
    ? `${rendererIcon(renderer)} ${rendererLabel(renderer)}`
    : prettyKind(tc.kind);
  const summary = specialized ? summarizeTool(tc, renderer) : shortTitle;

  return (
    <button
      type="button"
      className={"toolcall toolcall--compact " + statusCls}
      onClick={() => onOpen?.(tc)}
      title={`${tc.kind}: ${tc.title}（${statusLabel}，点击查看详情）`}
      aria-label={`${tc.kind} ${summary} ${statusLabel}`}
    >
      <span className="toolcall__kind">{kindLabel}</span>
      <span className="toolcall__title">{summary}</span>
      <span className={"toolcall__status-mark toolcall__status-mark--" + tc.status}>
        {statusMark}
      </span>
    </button>
  );
}

function prettyKind(kind: string): string {
  const k = (kind || "tool").toLowerCase();
  if (k.includes("edit") || k === "write" || k === "write_file") return "edit";
  if (k.includes("read")) return "read";
  if (k.includes("shell") || k.includes("terminal") || k.includes("execute") || k === "bash")
    return "shell";
  if (k.includes("search") || k.includes("grep") || k.includes("glob")) return "search";
  if (k.includes("list")) return "list";
  if (k.includes("ask") || k.includes("question") || k === "other") return "ask";
  return k.length > 12 ? k.slice(0, 12) : k;
}

/** Prefer a path / command snippet over the full verbose title. */
function shortenTitle(title: string, kind: string): string {
  const t = (title || "").trim();
  if (!t) return kind || "tool";
  // "Write `path`" / Write "path" / Write path
  const write = t.match(/Write\s+[`'"]?(.+?)[`'"]?\s*$/i);
  if (write?.[1]) return write[1];
  // Execute 'cmd' / Run …
  const exec = t.match(/^(?:Execute|Run)\s+[`'"]?(.+?)[`'"]?\s*$/i);
  if (exec?.[1]) {
    const cmd = exec[1];
    return cmd.length > 64 ? cmd.slice(0, 64) + "…" : cmd;
  }
  return t.length > 72 ? t.slice(0, 72) + "…" : t;
}

// ---------- shared detail body (drawer / artifacts) ----------

export function ToolCallDetailBody({
  tc,
  onOpenPath,
}: {
  tc: ToolCallView;
  onOpenPath?: (path: string) => void;
}) {
  const diff = tc.content.find((c) => c.type === "diff") as DiffContent | undefined;
  const cmd = tc.content.find((c) => c.type === "command_output") as
    | CommandOutputContent
    | undefined;
  const texts = tc.content.filter((c) => c.type === "text") as Array<{
    type: "text";
    text: string;
  }>;

  return (
    <div className="tool-detail">
      <div className="tool-detail__meta">
        <span className="toolcall__kind">{prettyKind(tc.kind)}</span>
        <span className={"tool-detail__status tool-detail__status--" + tc.status}>
          {tc.status === "completed"
            ? "已完成"
            : tc.status === "failed"
              ? "失败"
              : "运行中"}
        </span>
      </div>
      <h3 className="tool-detail__title">{tc.title}</h3>

      {diff && (
        <DiffView
          diff={diff.diff}
          onOpenPath={onOpenPath}
        />
      )}
      {cmd && (
        <div className="toolcall__cmd">
          {cmd.command && <CommandRiskBadge command={cmd.command} />}
          {cmd.command && (
            <pre className="toolcall__cmd-line">
              <span className="toolcall__prompt">$</span>
              {cmd.command}
            </pre>
          )}
          {cmd.output && <pre className="toolcall__output">{cmd.output}</pre>}
        </div>
      )}
      {texts.map((t, i) => (
        <pre key={i} className="toolcall__text">
          {t.text}
        </pre>
      ))}
      {!diff && !cmd && texts.length === 0 && tc.rawInput != null && (
        <pre className="toolcall__text toolcall__raw-input">
          {typeof tc.rawInput === "string"
            ? tc.rawInput
            : JSON.stringify(tc.rawInput, null, 2)}
        </pre>
      )}
      {!diff && !cmd && texts.length === 0 && tc.rawInput == null && (
        <p className="tool-detail__empty">暂无详细输出</p>
      )}
    </div>
  );
}

/**
 * 命令风险徽章 —— 对齐 WorkBuddy `command-risk`。
 *
 * 仅在 medium / high 时显示(对齐 WorkBuddy 标注而非拦截);low 不渲染任何东西。
 * `reasons` 通过 title 悬浮提示展示命中原因。
 */
function CommandRiskBadge({ command }: { command: string }) {
  const risk = checkCommandRisk(command);
  if (risk.level === "low") return null;
  const cls = risk.level === "high" ? "cmd-risk cmd-risk--high" : "cmd-risk cmd-risk--medium";
  const reasons = risk.reasons.length > 0 ? `\n原因:${risk.reasons.join("; ")}` : "";
  return (
    <span
      className={cls}
      role="status"
      title={`⚠️ ${riskLabel(risk.level)}命令${reasons}`}
    >
      ⚠️ {riskLabel(risk.level)}
    </span>
  );
}

function DiffView({
  diff,
  onOpenPath,
}: {
  diff: DiffContent["diff"];
  onOpenPath?: (path: string) => void;
}) {
  const path = diff.path || "";
  const oldLines = (diff.old ?? "").split("\n");
  const newLines = (diff.new ?? "").split("\n");

  const pathEl = path ? (
    <button
      type="button"
      className="diff__path diff__path--clickable"
      onClick={() => onOpenPath?.(path)}
      title={`打开：${path}`}
    >
      {path}
    </button>
  ) : (
    <div className="diff__path">(unknown path)</div>
  );

  if (diff.hunks && diff.hunks.length) {
    return (
      <div className="diff">
        {pathEl}
        <pre className="diff__body">
          {diff.hunks.map((h, i) => {
            const lines: string[] = [];
            h.old.lines.forEach((l) => lines.push("- " + l));
            h.new.lines.forEach((l) => lines.push("+ " + l));
            return <div key={i}>{lines.join("\n")}</div>;
          })}
        </pre>
      </div>
    );
  }
  return (
    <div className="diff">
      {pathEl}
      <pre className="diff__body">
        {oldLines.map((l, i) => (
          <div key={"o" + i} className="diff__del">
            - {l}
          </div>
        ))}
        {newLines.map((l, i) => (
          <div key={"n" + i} className="diff__add">
            + {l}
          </div>
        ))}
      </pre>
    </div>
  );
}
