/**
 * 嵌入式网页预览 —— 对齐 WorkBuddy `context-viewer-components/browser-preview`。
 *
 * 输入 URL,经安全校验后在 sandbox iframe 中预览。无效/不安全 URL 显示提示。
 * 纯展示组件,核心校验逻辑在 lib/browser-preview(已测)。
 */
import { useState } from "react";
import {
  normalizePreviewUrl,
  previewTitle,
  PREVIEW_SANDBOX,
} from "@/lib/browser-preview";

interface BrowserPreviewProps {
  /** 初始 URL。 */
  url: string;
  /** URL 变更回调(可选)。 */
  onUrlChange?: (url: string) => void;
}

export function BrowserPreview({ url, onUrlChange }: BrowserPreviewProps) {
  const [input, setInput] = useState(url);
  const normalized = normalizePreviewUrl(input);

  const go = () => {
    if (normalized) onUrlChange?.(normalized);
  };

  return (
    <div className="browser-preview" role="region" aria-label="网页预览">
      <div className="browser-preview__bar">
        <input
          className="browser-preview__input"
          type="text"
          value={input}
          placeholder="输入网址预览(https://…)"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") go();
          }}
          aria-label="预览网址"
        />
        <button
          type="button"
          className="browser-preview__go"
          onClick={go}
          disabled={!normalized}
        >
          预览
        </button>
      </div>
      {normalized ? (
        <iframe
          className="browser-preview__frame"
          src={normalized}
          title={previewTitle(normalized)}
          sandbox={PREVIEW_SANDBOX}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="browser-preview__empty">
          {input.trim()
            ? "该网址不可预览(仅允许 http/https 公网地址,拒绝本地/内网)。"
            : "输入一个 https 网址以预览。"}
        </div>
      )}
    </div>
  );
}
