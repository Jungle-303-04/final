// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BottomDockProvider } from "../../features/bottom-dock/BottomDockProvider";
import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import type { ScheduledRunCatalog, WorkloadDetailPort } from "../../features/workload-detail/workloadDetailContract";
import { I18nProvider } from "../../shared/i18n";
import { WorkloadExecution } from "./WorkloadExecution";

describe("WorkloadExecution", () => {
  it("renders the server-selected run and opens only its immutable log target", async () => {
    const user = userEvent.setup();
    const open = vi.fn(() => () => undefined);
    const port: WorkloadDetailPort = {
      getDetail: vi.fn(),
      getScheduledRuns: vi.fn(async (): Promise<ScheduledRunCatalog> => ({
        scope: { workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: ["shop"], freshness: "live" },
        owner: { apiGroup: "batch", version: "v1", kind: "CronJob", namespace: "shop", name: "nightly", uid: "owner-1" },
        runs: [{
          runKey: "run-1", resource: { apiGroup: "batch", version: "v1", kind: "Job", namespace: "shop", name: "nightly-1", uid: "run-1" },
          phase: "failed", active: false, scheduledAt: null, startedAt: "2026-07-16T09:00:00Z", finishedAt: "2026-07-16T09:01:00Z",
          desired: 1, succeeded: 0, failed: 1, podTotal: 1, podSucceeded: 0, podFailed: 1, podRunning: 0,
          nextStep: "logs", observedAt: "2026-07-16T09:01:00Z",
        }],
        lifecycle: [{
          eventId: "run-1:finished", runKey: "run-1", resource: { apiGroup: "batch", version: "v1", kind: "Job", namespace: "shop", name: "nightly-1", uid: "run-1" },
          stage: "finished", occurredAt: "2026-07-16T09:01:00Z", eventType: "warning", reason: "Job failed",
        }],
        defaultRunKey: "run-1", complete: true, reasonCodes: [],
      })),
    };

    render(<I18nProvider navigatorLanguage="en-US" storage={null}><AuthSessionGateProvider reportUnauthorized={vi.fn()}><BottomDockProvider port={{ open }}><WorkloadExecution port={port} request={{ clusterId: "cluster-a", apiGroup: "batch", apiVersion: "v1", kind: "CronJob", namespace: "shop", name: "nightly" }} /></BottomDockProvider></AuthSessionGateProvider></I18nProvider>);

    expect(await screen.findByText("Job failed")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "View logs" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith({
      type: "scheduled-run", clusterId: "cluster-a", kind: "CronJob", namespace: "shop", name: "nightly", runKey: "run-1",
    }, expect.any(Object)));
  });

  it("renders execution failures in Korean", async () => {
    const port: WorkloadDetailPort = {
      getDetail: vi.fn(),
      getScheduledRuns: vi.fn(async () => { throw new Error("unavailable"); }),
    };

    render(<I18nProvider navigatorLanguage="ko-KR" storage={null}><AuthSessionGateProvider reportUnauthorized={vi.fn()}><BottomDockProvider port={{ open: vi.fn(() => () => undefined) }}><WorkloadExecution port={port} request={{ clusterId: "cluster-a", apiGroup: "batch", apiVersion: "v1", kind: "CronJob", namespace: "shop", name: "nightly" }} /></BottomDockProvider></AuthSessionGateProvider></I18nProvider>);

    expect(await screen.findByText("현재 권한 범위의 실행 기록을 불러올 수 없습니다.")).toBeTruthy();
  });
});
