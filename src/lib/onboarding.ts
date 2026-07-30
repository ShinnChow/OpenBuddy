/**
 * 首次运行引导 —— 对齐 WorkBuddy `onboarding`(新手引导步骤)。
 *
 * 纯函数:引导步骤定义 + 进度跟踪 + 完成判定。OpenBuddy 的引导聚焦 BYOK 设置:
 * 配置 provider/model → 发送第一条消息 → 完成。持久化到 localStorage。
 */

/** 引导步骤 id。 */
export type OnboardingStepId =
  | "configure_provider"
  | "send_first_message"
  | "try_expert"
  | "done";

/** 一个引导步骤。 */
export interface OnboardingStep {
  id: OnboardingStepId;
  /** 标题。 */
  title: string;
  /** 说明。 */
  description: string;
  /** 是否完成。 */
  done: boolean;
}

/** 引导步骤定义(有序)。 */
export const ONBOARDING_STEPS: Array<Omit<OnboardingStep, "done">> = [
  {
    id: "configure_provider",
    title: "配置 API 提供商",
    description: "在「设置 → 模型」配置 BYOK provider(如 OpenAI/Anthropic/grok)与 API Key。",
  },
  {
    id: "send_first_message",
    title: "发送第一条消息",
    description: "在首页输入框输入问题,开始第一次对话。",
  },
  {
    id: "try_expert",
    title: "尝试专家/技能",
    description: "打开「专家·技能·连接器」召唤一个专家或安装一个技能。",
  },
];

const STORAGE_KEY = "openbuddy.onboarding";

/** 引导进度(按 step id → done)。 */
export interface OnboardingProgress {
  /** 已完成的步骤 id 集合。 */
  completed: OnboardingStepId[];
  /** 是否已整体完成(不再显示引导)。 */
  finished: boolean;
}

/** 从 localStorage 读取进度(缺省:空、未完成)。 */
export function loadOnboarding(): OnboardingProgress {
  if (typeof window === "undefined") return { completed: [], finished: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completed: [], finished: false };
    const obj = JSON.parse(raw);
    return {
      completed: Array.isArray(obj.completed) ? obj.completed : [],
      finished: !!obj.finished,
    };
  } catch {
    return { completed: [], finished: false };
  }
}

/** 持久化进度。 */
function save(p: OnboardingProgress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* 静默降级 */
  }
}

/** 标记一步完成(去重;返回新进度)。 */
export function completeStep(progress: OnboardingProgress, step: OnboardingStepId): OnboardingProgress {
  if (progress.completed.includes(step)) return progress;
  const next: OnboardingProgress = {
    ...progress,
    completed: [...progress.completed, step],
  };
  // 全部步骤完成 → 自动 finished。
  if (ONBOARDING_STEPS.every((s) => next.completed.includes(s.id)) && !next.finished) {
    next.finished = true;
  }
  save(next);
  return next;
}

/** 显式标记完成(用户跳过/关闭)。 */
export function finishOnboarding(progress: OnboardingProgress): OnboardingProgress {
  const next = { ...progress, finished: true };
  save(next);
  return next;
}

/** 重置引导(测试/重新触发用)。 */
export function resetOnboarding(): OnboardingProgress {
  const empty = { completed: [], finished: false };
  save(empty);
  return empty;
}

/** 把进度 + 定义合并成有序步骤列表(带 done 标记)。 */
export function buildSteps(progress: OnboardingProgress): OnboardingStep[] {
  return ONBOARDING_STEPS.map((s) => ({
    ...s,
    done: progress.completed.includes(s.id),
  }));
}

/** 完成进度(0–100)。 */
export function onboardingPct(progress: OnboardingProgress): number {
  if (ONBOARDING_STEPS.length === 0) return 100;
  const done = ONBOARDING_STEPS.filter((s) => progress.completed.includes(s.id)).length;
  return Math.round((done / ONBOARDING_STEPS.length) * 100);
}

/** 是否应显示引导(未完成且未整体跳过)。 */
export function shouldShowOnboarding(progress: OnboardingProgress): boolean {
  return !progress.finished && onboardingPct(progress) < 100;
}
