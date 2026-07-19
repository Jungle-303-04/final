import { describe, expect, it, vi } from "vitest";

import type { GitOpsEndpointDependencies } from "./gitOpsEndpointContract";
import { createRepositoryConnectionAdapter } from "./createRepositoryConnectionAdapter";

describe("createRepositoryConnectionAdapter", () => {
  it("exposes the server-owned repository discovery and connection sequence", async () => {
    const endpoints = {
      probeRepository: vi.fn().mockResolvedValue({
        repo_ref: "https://github.com/team/inventory-api",
        normalized_repo_ref: "team/inventory-api",
        valid: true,
        reachable: true,
        default_branch: "trunk",
        private: false,
        html_url: "https://github.com/team/inventory-api",
        warnings: [],
        errors: [],
      }),
      listRepositoryBranches: vi.fn().mockResolvedValue({
        repo_ref: "team/inventory-api",
        default_branch: "trunk",
        branches: [{ name: "trunk", protected: true, default: true }],
        warnings: [],
      }),
      listRepositoryManifests: vi.fn().mockResolvedValue({
        repo_ref: "team/inventory-api",
        branch: "trunk",
        candidates: [{
          path: "deploy/production",
          source_type: "kustomize",
          display_name: "Production overlay",
          reason: "kustomization.yaml",
        }],
        warnings: [],
      }),
      validateRepositoryManifest: vi.fn().mockResolvedValue({
        repo_ref: "team/inventory-api",
        branch: "trunk",
        manifest_path: "deploy/production",
        valid: true,
        status: "valid",
        validation_mode: "kustomize",
        resource_count: 4,
        resources: [],
        warnings: [],
        errors: [],
      }),
      getRepositoryConnectionStatus: vi.fn().mockResolvedValue({
        repo_ref: "team/inventory-api",
        repository_id: "repo-inventory",
        repository_status: "active",
        connection_stage: "ready",
        terminal: true,
        refresh_after_seconds: null,
      }),
    } as unknown as GitOpsEndpointDependencies;
    const port = createRepositoryConnectionAdapter(endpoints);

    await expect(port.probeRepository("team/inventory-api")).resolves.toMatchObject({
      normalizedRepoRef: "team/inventory-api",
      reachable: true,
    });
    await expect(port.listRepositoryBranches("team/inventory-api")).resolves.toMatchObject({
      defaultBranch: "trunk",
      branches: [{ name: "trunk", default: true, protected: true }],
    });
    await expect(port.listRepositoryManifests("team/inventory-api", "trunk")).resolves.toMatchObject({
      candidates: [{ path: "deploy/production", sourceType: "kustomize" }],
    });
    await expect(port.validateRepositoryManifest({
      repoRef: "team/inventory-api",
      branch: "trunk",
      manifestPath: "deploy/production",
      sourceType: "kustomize",
    })).resolves.toMatchObject({ valid: true, resourceCount: 4 });
    await expect(port.getRepositoryConnectionStatus("team/inventory-api")).resolves.toMatchObject({
      repositoryId: "repo-inventory",
      repositoryStatus: "active",
      connectionStage: "ready",
      terminal: true,
    });
  });
});
