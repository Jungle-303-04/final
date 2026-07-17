// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { DiagnoseSurface } from "./DiagnoseSurface";
import type { DiagnosePort } from "./diagnoseContract";

describe("DiagnoseSurface", () => {
  it("renders durable history and opens the selected investigation", async () => {
    const onActiveRunChange = vi.fn();
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <DiagnoseSurface
          activeRunId={null}
          onActiveRunChange={onActiveRunChange}
          port={port()}
        />
      </I18nProvider>,
    );

    await userEvent.click(await screen.findByRole("button", {
      name: /Deployment\/checkout/u,
    }));
    expect(onActiveRunChange).toHaveBeenCalledWith("run-1");
    expect(screen.getByText("Recent investigations")).not.toBeNull();
  });

  it("replays verdict evidence and keeps follow-up disabled until completion", async () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <DiagnoseSurface
          activeRunId="run-1"
          onActiveRunChange={vi.fn()}
          port={port()}
        />
      </I18nProvider>,
    );

    expect(await screen.findByText("Evidence-backed result")).not.toBeNull();
    expect(
      screen.getByText("Evidence-backed result").closest('[data-kind="verdict"]')?.className,
    ).toContain("motion-diagnose-verdict");
    expect(screen.getByRole("link", { name: "Deployment checkout" }).getAttribute("href"))
      .toBe("/resources/workload?resource=checkout");
    expect(
      (screen.getByRole("textbox", { name: /후속 질문|Follow-up/u }) as HTMLTextAreaElement)
        .disabled,
    ).toBe(false);
  });

  it("renders investigation controls in Korean", async () => {
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <DiagnoseSurface
          activeRunId="run-1"
          onActiveRunChange={vi.fn()}
          port={port()}
        />
      </I18nProvider>,
    );

    expect(await screen.findByRole("button", { name: "최근 조사로 돌아가기" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "새로 고침" })).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "후속 질문" })).not.toBeNull();
    expect(await screen.findByText("근거")).not.toBeNull();
  });
});

function port(): DiagnosePort {
  return {
    getCapabilities: async () => ({
      enabled: true,
      agent: { id: "operations-ai", isolated: true, model: null, effort: "medium" },
      label: "Operations AI",
      disclosureRevision: "v1",
      consented: true,
      reasonCodes: [],
    }),
    grantBrowserConsent: async () => undefined,
    startResourceRun: async () => {
      throw new Error("not used");
    },
    listRuns: async () => ({
      runs: [{
        runId: "run-1",
        target: {
          clusterId: "cluster-a",
          resourceType: "workload",
          apiGroup: "apps",
          apiVersion: "v1",
          kind: "Deployment",
          namespace: "shop",
          name: "checkout",
          uid: "uid-checkout",
        },
        status: "completed",
        statusReason: null,
        createdAt: "2026-07-16T08:00:00Z",
        updatedAt: "2026-07-16T08:00:01Z",
      }],
      complete: true,
      historyStatus: "available",
      reasonCodes: [],
    }),
    addTurn: async () => {
      throw new Error("not used");
    },
    stopRun: async () => {
      throw new Error("not used");
    },
    clearFinished: async () => 0,
    async *subscribeEvents() {
      yield {
        runId: "run-1",
        sequence: 1,
        kind: "verdict",
        payload: {
          answer: "Evidence-backed result",
          evidence: [{
            link: "/resources/workload?resource=checkout",
            label: "Deployment checkout",
          }],
        },
        occurredAt: "2026-07-16T08:00:01Z",
      };
      yield {
        runId: "run-1",
        sequence: 2,
        kind: "closed",
        payload: { status: "completed" },
        occurredAt: "2026-07-16T08:00:02Z",
      };
    },
  };
}
