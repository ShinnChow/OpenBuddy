import { describe, it, expect, beforeEach } from "vitest";
import {
  ONBOARDING_STEPS,
  loadOnboarding,
  completeStep,
  finishOnboarding,
  resetOnboarding,
  buildSteps,
  onboardingPct,
  shouldShowOnboarding,
} from "../onboarding";

describe("onboarding", () => {
  beforeEach(() => {
    window.localStorage.removeItem("openbuddy.onboarding");
  });

  it("loadOnboarding 缺省空 + 未完成", () => {
    const p = loadOnboarding();
    expect(p.completed).toEqual([]);
    expect(p.finished).toBe(false);
  });

  it("completeStep 标记完成(去重)", () => {
    let p = loadOnboarding();
    p = completeStep(p, "configure_provider");
    expect(p.completed).toEqual(["configure_provider"]);
    p = completeStep(p, "configure_provider"); // 去重
    expect(p.completed).toEqual(["configure_provider"]);
  });

  it("completeStep 持久化到 localStorage", () => {
    let p = loadOnboarding();
    p = completeStep(p, "configure_provider");
    const raw = window.localStorage.getItem("openbuddy.onboarding");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).completed).toEqual(["configure_provider"]);
  });

  it("全部步骤完成 → 自动 finished", () => {
    let p = loadOnboarding();
    for (const s of ONBOARDING_STEPS) p = completeStep(p, s.id);
    expect(p.finished).toBe(true);
  });

  it("finishOnboarding 标记完成", () => {
    let p = loadOnboarding();
    p = finishOnboarding(p);
    expect(p.finished).toBe(true);
  });

  it("resetOnboarding 清空", () => {
    let p = completeStep(loadOnboarding(), "configure_provider");
    p = resetOnboarding();
    expect(p.completed).toEqual([]);
    expect(p.finished).toBe(false);
    expect(loadOnboarding().completed).toEqual([]);
  });

  it("buildSteps 合并进度与定义(带 done)", () => {
    const p = completeStep(loadOnboarding(), "send_first_message");
    const steps = buildSteps(p);
    expect(steps).toHaveLength(ONBOARDING_STEPS.length);
    expect(steps.find((s) => s.id === "send_first_message")?.done).toBe(true);
    expect(steps.find((s) => s.id === "configure_provider")?.done).toBe(false);
  });

  it("onboardingPct", () => {
    expect(onboardingPct(loadOnboarding())).toBe(0);
    const p = completeStep(loadOnboarding(), "configure_provider");
    // 1/3 → 33
    expect(onboardingPct(p)).toBe(33);
  });

  it("shouldShowOnboarding", () => {
    expect(shouldShowOnboarding(loadOnboarding())).toBe(true);
    expect(shouldShowOnboarding(finishOnboarding(loadOnboarding()))).toBe(false);
    let p = loadOnboarding();
    for (const s of ONBOARDING_STEPS) p = completeStep(p, s.id);
    expect(shouldShowOnboarding(p)).toBe(false);
  });
});
