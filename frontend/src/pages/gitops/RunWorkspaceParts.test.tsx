// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReleaseRun } from "../../features/gitops/gitOpsContract";
import { I18nProvider } from "../../shared/i18n";
import { RunActions, RunStatusBadge } from "./RunWorkspaceParts";

afterEach(cleanup);

describe("workflow run status actions", () => {
  it("uses derived failure for the badge and exposes recovery without impossible progress actions", () => {
    const run = releaseRun("running", "failed");
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <RunStatusBadge status={run.derived_status || run.status} />
        <RunActions onAction={vi.fn()} onApprovalDecision={vi.fn()} pending={false} run={run} />
      </I18nProvider>,
    );

    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Request rollback" })).toBeNull();
    expect(screen.getByRole("button", { name: "Notify owner" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Advance wave" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel run" })).toBeNull();
  });

  it("keeps rollback-requested runs terminal", () => {
    const run = releaseRun("rollback_requested", "rollback_requested");
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <RunStatusBadge status={run.derived_status || run.status} />
        <RunActions onAction={vi.fn()} onApprovalDecision={vi.fn()} pending={false} run={run} />
      </I18nProvider>,
    );

    expect(screen.getByText("Rollback requested")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Notify owner" })).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(1);
  });

  it("uses the waiting step approval identity instead of the blocked advance action", () => {
    const onApprovalDecision = vi.fn();
    const run = releaseRun("waiting_for_approval", "waiting_for_approval");
    run.steps = [{
      run_step_id: "step-a",
      application_id: "app-a",
      name: "Production approval",
      wave: 1,
      status: "waiting_for_approval",
      approval_id: "approval-a",
      health: {},
      rollback: {},
      details: {},
      workflow: {},
    }];
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <RunActions
          onAction={vi.fn()}
          onApprovalDecision={onApprovalDecision}
          pending={false}
          run={run}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(onApprovalDecision).toHaveBeenCalledWith(run, "approval-a", "grant");
    expect(screen.queryByRole("button", { name: "Advance wave" })).toBeNull();
  });

  it("offers rollback only for a non-terminal run with rollback enabled", () => {
    const run = releaseRun("running", "running");
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <RunActions onAction={vi.fn()} onApprovalDecision={vi.fn()} pending={false} run={run} />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "Request rollback" })).toBeTruthy();
  });
});

function releaseRun(status: string, derivedStatus: string): ReleaseRun {
  return {
    run_id: "run-a",
    plan_id: "plan-a",
    plan_name: "Production release",
    status,
    derived_status: derivedStatus,
    current_wave: 1,
    total_waves: 1,
    settings: {},
    github: {},
    rollback: {},
    health: {},
    steps: [],
    events: [],
  };
}
