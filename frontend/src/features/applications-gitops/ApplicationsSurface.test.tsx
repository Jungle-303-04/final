// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { ApplicationsSurface } from "./ApplicationsSurface";
import {
  ApplicationsGitOpsFailure,
  type ApplicationsGitOpsPort,
} from "./applicationsGitOpsContract";

afterEach(cleanup);

function port(overrides: Partial<ApplicationsGitOpsPort> = {}): ApplicationsGitOpsPort {
  return {
    listApplications: vi.fn().mockResolvedValue({ applications: [] }),
    loadGitOpsSnapshot: vi.fn().mockResolvedValue({ deployments: [], runs: [] }),
    ...overrides,
  };
}

function renderSurface(subject: ApplicationsGitOpsPort) {
  return render(
    <I18nProvider navigatorLanguage="en" storage={null}>
      <ApplicationsSurface port={subject} />
    </I18nProvider>,
  );
}

describe("Applications surface", () => {
  it("renders repository-backed Applications and labels missing evidence unavailable", async () => {
    renderSurface(port({
      listApplications: vi.fn().mockResolvedValue({
        applications: [{
          id: "app-1",
          name: "checkout-api",
          repositoryId: "repo-1",
          repositoryRef: "opsia/checkout",
          branch: "main",
          manifestPath: null,
          status: "active",
        }],
      }),
    }));

    expect(await screen.findByRole("heading", { name: "Applications" })).toBeTruthy();
    expect(screen.getByText("checkout-api")).toBeTruthy();
    expect(screen.getByText("opsia/checkout")).toBeTruthy();
    expect(screen.getByText(/Cluster filtering remains unavailable/)).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
  });

  it("shows an honest unavailable boundary when the backend capability is absent", async () => {
    renderSurface(port({
      listApplications: vi.fn().mockRejectedValue(
        new ApplicationsGitOpsFailure("unavailable"),
      ),
    }));

    expect(await screen.findByText(/backend capability is not deployed yet/i)).toBeTruthy();
    expect(screen.queryByText("checkout-api")).toBeNull();
  });
});
