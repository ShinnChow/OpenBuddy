/**
 * 首次运行引导横幅 —— 对齐 WorkBuddy `onboarding`。
 *
 * 用户未完成引导步骤时在首页显示进度卡;完成后或用户关闭后不再显示(持久化)。
 * 步骤由外部事件标记完成(props.onStep 完成回调,调用方在对应动作时触发)。
 */
import { useEffect, useState } from "react";
import {
  loadOnboarding,
  completeStep,
  finishOnboarding,
  buildSteps,
  onboardingPct,
  shouldShowOnboarding,
  type OnboardingProgress,
  type OnboardingStepId,
} from "@/lib/onboarding";

interface OnboardingBannerProps {
  /** 已完成的步骤 id(由调用方按当前状态传入,如 provider 已配置 → "configure_provider")。 */
  completedSteps?: OnboardingStepId[];
  /** 跳过/关闭回调(可选)。 */
  onDismiss?: () => void;
}

export function OnboardingBanner({ completedSteps = [], onDismiss }: OnboardingBannerProps) {
  const [progress, setProgress] = useState<OnboardingProgress>(() => loadOnboarding());

  // 外部传入的已完成步骤合并进进度(幂等)。
  useEffect(() => {
    setProgress((prev) => {
      let next = prev;
      for (const s of completedSteps) next = completeStep(next, s);
      return next;
    });
  }, [completedSteps]);

  if (!shouldShowOnboarding(progress)) return null;

  const steps = buildSteps(progress);
  const pct = onboardingPct(progress);
  const dismiss = () => {
    setProgress((p) => finishOnboarding(p));
    onDismiss?.();
  };

  return (
    <div className="onboarding-banner" role="region" aria-label="新手引导">
      <div className="onboarding-banner__head">
        <span className="onboarding-banner__title">欢迎来到 OpenBuddy</span>
        <button
          type="button"
          className="onboarding-banner__dismiss"
          onClick={dismiss}
          aria-label="关闭引导"
        >
          跳过
        </button>
      </div>
      <div className="onboarding-banner__bar">
        <div className="onboarding-banner__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <ul className="onboarding-banner__steps">
        {steps.map((s) => (
          <li
            key={s.id}
            className={"onboarding-banner__step" + (s.done ? " onboarding-banner__step--done" : "")}
          >
            <span className="onboarding-banner__step-mark">{s.done ? "✓" : "○"}</span>
            <span className="onboarding-banner__step-title">{s.title}</span>
            <span className="onboarding-banner__step-desc">{s.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
