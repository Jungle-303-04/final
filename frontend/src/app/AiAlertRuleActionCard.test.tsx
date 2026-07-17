// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import type { AiAlertRuleAction } from "../features/ai-assistant/aiAssistantContract";
import { UnifiedFilterProvider } from "../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../shared/i18n";
import { AiAlertRuleActionCard } from "./AiAlertRuleActionCard";

afterEach(cleanup);

const ACTION: AiAlertRuleAction = {
  type: "create_alert_rule",
  rationale: "현재 클러스터의 파드 CPU 사용률을 감시합니다.",
  payload: {
    name: "파드 CPU 70% 알림",
    scope: { clusters: ["cluster-2"], namespaces: [], applications: [], labels: [] },
    metric: "cpu_pct",
    comparator: ">",
    threshold: 70,
    forSeconds: 20,
    severity: "high",
    channels: [],
    enabled: true,
  },
};

describe("AI alert action card", () => {
  it("shows an actual confirmation timeline and submits only after the user clicks", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ ruleId: "rule-42" });
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <MemoryRouter><UnifiedFilterProvider><AiAlertRuleActionCard action={ACTION} onCreate={onCreate} /></UnifiedFilterProvider></MemoryRouter>
      </I18nProvider>,
    );

    expect(screen.getByText("승인 대기")).toBeTruthy();
    expect(screen.getByText("클러스터: cluster-2")).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "알림 만들기" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(ACTION));
    const completed = (await screen.findByText("알림 규칙이 생성되었습니다 · rule-42"))
      .closest('[data-action-state="completed"]');
    expect(completed?.className).toContain("max-w-full");
    expect(completed?.className).toContain("overflow-hidden");
    const rulesLink = screen.getByRole("link", { name: "알림 규칙 보기" });
    expect(rulesLink.getAttribute("href")).toContain("tab=rules");
    expect(rulesLink.getAttribute("href")).toContain("detail=rule-42");
    expect(rulesLink.className).toContain("whitespace-nowrap");
    expect(screen.queryByText("등록 완료")).toBeNull();
  });

  it("opens prefilled editing and applies a real threshold change", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ ruleId: "rule-43" });
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <MemoryRouter><UnifiedFilterProvider><AiAlertRuleActionCard action={ACTION} onCreate={onCreate} /></UnifiedFilterProvider></MemoryRouter>
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "수정" }));
    const threshold = screen.getByLabelText("임계값 (%)");
    await user.clear(threshold);
    await user.type(threshold, "75");
    await user.click(screen.getByRole("button", { name: "변경 적용" }));
    await user.click(screen.getByRole("button", { name: "알림 만들기" }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ threshold: 75 }),
    }));
  });

  it("renders action scope labels from the English catalog", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter>
          <UnifiedFilterProvider>
            <AiAlertRuleActionCard action={ACTION} onCreate={vi.fn()} />
          </UnifiedFilterProvider>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(screen.getByText("Cluster: cluster-2")).toBeTruthy();
    expect(screen.queryByText("클러스터: cluster-2")).toBeNull();
  });
});
