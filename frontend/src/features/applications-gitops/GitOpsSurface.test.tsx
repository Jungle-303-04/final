// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import {
  ApplicationsGitOpsFailure,
  type ApplicationsGitOpsPort,
} from "./applicationsGitOpsContract";
import { GitOpsSurface } from "./GitOpsSurface";

afterEach(cleanup);

const applications = [
  {
    id: "app-1",
    name: "checkout-api",
    repositoryId: "repo-1",
    repositoryRef: "opsia/checkout",
    branch: "main",
    manifestPath: "deploy/prod",
    status: "active",
  },
  {
    id: "app-2",
    name: "payments-api",
    repositoryId: "repo-2",
    repositoryRef: "opsia/payments",
    branch: "main",
    manifestPath: "deploy/prod",
    status: "active",
  },
] as const;

function renderSurface(subject: ApplicationsGitOpsPort) {
  return render(
    <I18nProvider navigatorLanguage="en" storage={null}>
      <GitOpsSurface port={subject} />
    </I18nProvider>,
  );
}

describe("GitOps surface", () => {
  it("renders target evidence and promotion gates, then loads another Application", async () => {
    const loadGitOpsSnapshot = vi.fn()
      .mockResolvedValueOnce({
        deployments: [{
          id: "binding-1",
          clusterId: "prod-seoul-01",
          namespace: "checkout",
          environment: "prod",
          manifestPath: "deploy/prod",
          pollStatus: "healthy",
          lastCommitSha: "abc123",
          lastPolledAt: "2026-07-14T00:00:00Z",
        }],
        runs: [{
          id: "run-1",
          status: "completed",
          currentStep: "health",
          revision: "abc123",
          updatedAt: "2026-07-14T00:01:00Z",
          promotionGate: "eligible",
          failedResourceCount: 0,
        }],
      })
      .mockResolvedValueOnce({ deployments: [], runs: [] });
    renderSurface({
      listApplications: vi.fn().mockResolvedValue({ applications }),
      loadGitOpsSnapshot,
    });

    expect(await screen.findByText(
      "prod-seoul-01",
      {},
      { timeout: 10_000 },
    )).toBeTruthy();
    expect(screen.getByText("abc123")).toBeTruthy();
    expect(screen.getByText("Eligible")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "payments-api" }));
    expect(await screen.findByText("No deployment targets are recorded for this Application.")).toBeTruthy();
    expect(loadGitOpsSnapshot).toHaveBeenLastCalledWith("app-2", expect.any(AbortSignal));
  });

  it("renders 404 as unavailable without fabricated workflow history", async () => {
    renderSurface({
      listApplications: vi.fn().mockResolvedValue({ applications: [applications[0]] }),
      loadGitOpsSnapshot: vi.fn().mockRejectedValue(
        new ApplicationsGitOpsFailure("unavailable"),
      ),
    });

    expect(await screen.findByText(/backend capability is not deployed yet/i)).toBeTruthy();
    expect(screen.queryByText("Eligible")).toBeNull();
    expect(screen.queryByText("Succeeded")).toBeNull();
  });
});
