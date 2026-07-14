import { describe, expect, it, vi } from "vitest";
import {
  ApplicationsGitOpsFailure,
  type ApplicationsGitOpsApiDependencies,
} from "./applicationsGitOpsContract";
import { createApplicationsGitOpsAdapter } from "./createApplicationsGitOpsAdapter";

function api(overrides: Partial<ApplicationsGitOpsApiDependencies> = {}): ApplicationsGitOpsApiDependencies {
  return {
    listApplications: vi.fn().mockResolvedValue({ applications: [] }),
    listApplicationDeployments: vi.fn().mockResolvedValue({ deployments: [] }),
    listApplicationRuns: vi.fn().mockResolvedValue({ runs: [] }),
    ...overrides,
  };
}

describe("Applications/GitOps adapter", () => {
  it("maps only authoritative Application, binding, run, and promotion-gate fields", async () => {
    const dependencies = api({
      listApplications: vi.fn().mockResolvedValue({
        applications: [{
          application_id: "app-1",
          name: "checkout-api",
          repository_id: "repo-1",
          repo_ref: "opsia/checkout",
          default_branch: "main",
          manifest_path: "deploy/prod",
          status: "active",
          provider_secret: "must-not-project",
        }],
      }),
      listApplicationDeployments: vi.fn().mockResolvedValue({
        deployments: [{
          binding_id: "binding-1",
          cluster_id: "cluster-1",
          namespace: "checkout",
          environment: "prod",
          manifest_path: "deploy/prod",
          gitops_poll: {
            status: "healthy",
            last_seen_commit_sha: "abc123",
            last_polled_at: "2026-07-14T00:00:00Z",
            error: "must-not-project",
          },
        }],
      }),
      listApplicationRuns: vi.fn().mockResolvedValue({
        runs: [{
          workflow_run_id: "run-1",
          status: "completed",
          current_step: "health",
          source_revision: "abc123",
          updated_at: "2026-07-14T00:01:00Z",
          promotion_gate: {
            eligible: false,
            failed_resource_count: 2,
          },
          workflow_payload: "must-not-project",
        }],
      }),
    });
    const adapter = createApplicationsGitOpsAdapter(dependencies);

    await expect(adapter.listApplications()).resolves.toEqual({
      applications: [{
        id: "app-1",
        name: "checkout-api",
        repositoryId: "repo-1",
        repositoryRef: "opsia/checkout",
        branch: "main",
        manifestPath: "deploy/prod",
        status: "active",
      }],
    });
    await expect(adapter.loadGitOpsSnapshot("app-1")).resolves.toEqual({
      deployments: [{
        id: "binding-1",
        clusterId: "cluster-1",
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
        promotionGate: "blocked",
        failedResourceCount: 2,
      }],
    });
  });

  it("keeps absent optional evidence unavailable instead of inventing values", async () => {
    const adapter = createApplicationsGitOpsAdapter(api({
      listApplications: vi.fn().mockResolvedValue({
        applications: [{ application_id: "app-1", name: "checkout-api" }],
      }),
    }));

    await expect(adapter.listApplications()).resolves.toEqual({
      applications: [{
        id: "app-1",
        name: "checkout-api",
        repositoryId: null,
        repositoryRef: null,
        branch: null,
        manifestPath: null,
        status: null,
      }],
    });
  });

  it("isolates old-backend 404 responses as unavailable", async () => {
    const adapter = createApplicationsGitOpsAdapter(api({
      listApplicationRuns: vi.fn().mockRejectedValue({ kind: "not-found", status: 404 }),
    }));

    await expect(adapter.loadGitOpsSnapshot("app-1")).rejects.toEqual(
      expect.objectContaining({
        code: "unavailable",
        name: "ApplicationsGitOpsFailure",
      } satisfies Partial<ApplicationsGitOpsFailure>),
    );
  });

  it("fails closed when an Application or run identity is absent", async () => {
    const missingApplicationIdentity = createApplicationsGitOpsAdapter(api({
      listApplications: vi.fn().mockResolvedValue({ applications: [{ name: "checkout" }] }),
    }));
    await expect(missingApplicationIdentity.listApplications()).rejects.toMatchObject({
      code: "invalid-response",
    });

    const missingRunIdentity = createApplicationsGitOpsAdapter(api({
      listApplicationRuns: vi.fn().mockResolvedValue({ runs: [{ status: "running" }] }),
    }));
    await expect(missingRunIdentity.loadGitOpsSnapshot("app-1")).rejects.toMatchObject({
      code: "invalid-response",
    });
  });
});
