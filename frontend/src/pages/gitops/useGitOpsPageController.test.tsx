// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { ProductNotificationsProvider } from "../../features/notifications/ProductNotificationsProvider";
import type { ReleaseRun } from "../../features/gitops/gitOpsContract";
import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";
import { I18nProvider } from "../../shared/i18n";
import { toast } from "../../shared/ui/primitives/sonner";
import { gitOpsPort } from "./GitOpsPage.testSupport";
import { useGitOpsPageController } from "./useGitOpsPageController";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("workflow run notifications", () => {
  it("updates one ledger entry per run while emitting each observed state transition", async () => {
    vi.useFakeTimers();
    const port = gitOpsPort();
    port.listRuns = vi.fn()
      .mockResolvedValueOnce([releaseRun("running")])
      .mockResolvedValueOnce([releaseRun("waiting_for_approval")])
      .mockResolvedValueOnce([releaseRun("succeeded")]);
    const warning = vi.spyOn(toast, "warning");
    const success = vi.spyOn(toast, "success");
    const refreshPolicies = policyRegistry();

    renderHook(() => useGitOpsPageController(port, refreshPolicies), { wrapper: Wrapper });
    await flush();

    act(() => vi.advanceTimersByTime(1_000));
    await flush();
    act(() => vi.advanceTimersByTime(1_000));
    await flush();

    expect(warning).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledOnce();
    const ledger = JSON.parse(
      window.localStorage.getItem("opsia:notifications:v1:anonymous:anonymous") || "[]",
    ) as { href: string; id: string; title: string }[];
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      id: "workflow-run:run-a",
      title: "Production release · Succeeded",
    });
    expect(ledger[0].href).toContain("/deploy");
    expect(ledger[0].href).toContain("plan=plan-a");
  });

});

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <MemoryRouter initialEntries={["/deploy?section=workflows&plan=plan-a"]}>
        <UnifiedFilterProvider>
          <ProductNotificationsProvider>{children}</ProductNotificationsProvider>
        </UnifiedFilterProvider>
      </MemoryRouter>
    </I18nProvider>
  );
}

function policyRegistry(): BrowserRefreshPolicyRegistry<"gitops_rows"> {
  return {
    getPolicy: vi.fn().mockResolvedValue({
      eventInvalidation: false,
      keepLastSuccess: true,
      pauseWhenHidden: true,
      postMutationRefreshAfterSeconds: null,
      refreshAfterSeconds: 1,
      retryAfterSeconds: null,
      retryLimit: null,
      staleAfterSeconds: null,
    }),
  };
}

function releaseRun(status: string): ReleaseRun {
  return {
    run_id: "run-a",
    plan_id: "plan-a",
    plan_name: "Production release",
    status,
    derived_status: status,
    current_wave: 1,
    total_waves: 1,
    settings: {},
    github: {},
    rollback: {},
    health: {},
    steps: [],
    events: [],
    updated_at: "2026-07-20T01:00:00Z",
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}
