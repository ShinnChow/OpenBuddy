import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OnboardingBanner } from "../OnboardingBanner";
import { resetOnboarding } from "@/lib/onboarding";

describe("OnboardingBanner", () => {
  beforeEach(() => {
    window.localStorage.removeItem("openbuddy.onboarding");
    resetOnboarding();
  });

  it("未完成时显示引导", () => {
    render(<OnboardingBanner />);
    expect(screen.getByText("欢迎来到 OpenBuddy")).toBeInTheDocument();
    expect(screen.getByText("配置 API 提供商")).toBeInTheDocument();
  });

  it("completedSteps 标记步骤完成(进度推进)", () => {
    const { rerender } = render(<OnboardingBanner completedSteps={["configure_provider"]} />);
    // configure_provider 完成 → 该步带 ✓(done 样式)。
    const step = screen.getByText("配置 API 提供商").closest("li");
    expect(step?.className).toContain("done");
    // 进度条存在。
    expect(document.querySelector(".onboarding-banner__bar-fill")).not.toBeNull();
    void rerender;
  });

  it("全部步骤完成 → 不再显示", () => {
    const { rerender } = render(
      <OnboardingBanner completedSteps={["configure_provider", "send_first_message", "try_expert"]} />,
    );
    rerender(
      <OnboardingBanner completedSteps={["configure_provider", "send_first_message", "try_expert"]} />,
    );
    expect(screen.queryByText("欢迎来到 OpenBuddy")).toBeNull();
  });

  it("点击「跳过」关闭并持久化", () => {
    render(<OnboardingBanner />);
    fireEvent.click(screen.getByRole("button", { name: "关闭引导" }));
    expect(screen.queryByText("欢迎来到 OpenBuddy")).toBeNull();
    // 持久化:重新 mount 仍不显示。
    render(<OnboardingBanner />);
    expect(screen.queryByText("欢迎来到 OpenBuddy")).toBeNull();
  });

  it("已 finished 状态不再显示", () => {
    window.localStorage.setItem(
      "openbuddy.onboarding",
      JSON.stringify({ completed: [], finished: true }),
    );
    render(<OnboardingBanner />);
    expect(screen.queryByText("欢迎来到 OpenBuddy")).toBeNull();
  });
});
