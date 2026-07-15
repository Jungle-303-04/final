// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import type {
  AlertRule,
  AlertRulesPort,
} from "../../features/alerts/alertRulesContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../../shared/i18n";
import { AlertRulesPanel } from "./AlertRulesPanel";

afterEach(cleanup);

const RULE: AlertRule = {
  id: "rule-42",
  name: "파드 CPU 70% 알림",
  scope: {
    clusters: ["cluster-2"],
    namespaces: [],
    applications: [],
    labels: [],
  },
  metric: "cpu_pct",
  comparator: ">",
  threshold: 70,
  forSeconds: 20,
  severity: "high",
  channels: [],
  enabled: true,
  lastFiredAt: null,
  occurrenceCount: 0,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
};

describe("AlertRulesPanel", () => {
  it("loads and focuses the rule selected by the AI action URL", async () => {
    const port = rulesPort({ list: vi.fn().mockResolvedValue([RULE]) });
    renderPanel(port, "rule-42");

    const card = await ruleCard("파드 CPU 70% 알림");
    expect(card.getAttribute("data-alert-rule-id")).toBe("rule-42");
    expect(card.className).toContain("ring-2");
    expect(within(card).getByRole("button", { name: "중지" })).toBeTruthy();
    expect(within(card).getByRole("button", { name: "수정" })).toBeTruthy();
    expect(within(card).getByRole("button", { name: "삭제" })).toBeTruthy();
  });

  it("creates with the current filter scope and renders the authoritative refreshed rule", async () => {
    const user = userEvent.setup();
    const list = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([RULE]);
    const create = vi.fn().mockResolvedValue({ ruleId: "rule-42" });
    const port = rulesPort({ create, list });
    renderPanel(port, null, "/alerts?tab=rules&clusters=cluster-2");

    await screen.findByText("등록된 알림 규칙이 없습니다");
    await user.click(screen.getAllByRole("button", { name: "규칙 추가" })[0]!);
    await user.type(screen.getByLabelText("이름"), "파드 CPU 70% 알림");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      name: "파드 CPU 70% 알림",
      scope: expect.objectContaining({ clusters: ["cluster-2"] }),
      forSeconds: 20,
    })));
    expect(list).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("알림 규칙을 만들었습니다.")).toBeTruthy();
    expect(await ruleCard("파드 CPU 70% 알림")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows in-place progress while an existing rule is being changed", async () => {
    const user = userEvent.setup();
    let resolveUpdate: ((rule: AlertRule) => void) | undefined;
    const update = vi.fn(() => new Promise<AlertRule>((resolve) => { resolveUpdate = resolve; }));
    renderPanel(rulesPort({ list: vi.fn().mockResolvedValue([RULE]), update }), null);

    const card = await ruleCard("파드 CPU 70% 알림");
    await user.click(within(card).getByRole("button", { name: "중지" }));

    expect(card.getAttribute("aria-busy")).toBe("true");
    expect(within(card).getByText("저장 중")).toBeTruthy();
    resolveUpdate?.({ ...RULE, enabled: false });
    await waitFor(() => expect(within(card).getByText("중지됨")).toBeTruthy());
    expect(card.getAttribute("aria-busy")).toBe("false");
  });

  it("keeps the editor values and exposes retry after a failed create", async () => {
    const user = userEvent.setup();
    const create = vi.fn().mockRejectedValueOnce(new Error("network"));
    renderPanel(rulesPort({ create, list: vi.fn().mockResolvedValue([]) }), null);

    await screen.findByText("등록된 알림 규칙이 없습니다");
    await user.click(screen.getAllByRole("button", { name: "규칙 추가" })[0]!);
    await user.type(screen.getByLabelText("이름"), "중요 알림");
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("알림 규칙을 불러오지 못했습니다.")).toBeTruthy();
    expect((screen.getByLabelText("이름") as HTMLInputElement).value).toBe("중요 알림");
    expect(screen.getByRole("button", { name: "저장" }).hasAttribute("disabled")).toBe(false);
  });
});

function renderPanel(
  port: AlertRulesPort,
  focusRuleId: string | null,
  entry = "/alerts?tab=rules",
) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <MemoryRouter initialEntries={[entry]}>
        <UnifiedFilterProvider>
          <AlertRulesPanel focusRuleId={focusRuleId} port={port} />
        </UnifiedFilterProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

async function ruleCard(name: string): Promise<HTMLElement> {
  const heading = await screen.findByText(name);
  const card = heading.closest<HTMLElement>('[data-alert-rule-id]');
  if (!card) throw new Error(`Missing rule card for ${name}`);
  return card;
}

function rulesPort(overrides: Partial<AlertRulesPort>): AlertRulesPort {
  return {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ ruleId: "rule-created" }),
    update: vi.fn().mockImplementation(async (_id, input) => ({ ...RULE, ...input })),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
