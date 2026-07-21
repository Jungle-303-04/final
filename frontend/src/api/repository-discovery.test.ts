import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listRepositoryBranches,
  listRepositoryManifestCandidates,
  probeRepository,
  validateRepositoryManifest,
} from "./repository-discovery";

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { "content-type": "application/json" },
});

afterEach(() => vi.restoreAllMocks());

describe("repository discovery API", () => {
  it("probes, lists branches and candidates, then validates the exact manifest", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        repo_ref: "team/game", normalized_repo_ref: "team/game", valid: true, reachable: true,
        default_branch: "main", private: false, html_url: "https://github.com/team/game", warnings: [], errors: [],
      }))
      .mockResolvedValueOnce(jsonResponse({
        repo_ref: "team/game", default_branch: "main", branches: [{ name: "main", protected: true, default: true }], warnings: [],
      }))
      .mockResolvedValueOnce(jsonResponse({
        repo_ref: "team/game", branch: "main", candidates: [{ path: "deploy/game.yaml", source_type: "raw-yaml", display_name: "game", reason: "Kubernetes manifest" }], warnings: [],
      }))
      .mockResolvedValueOnce(jsonResponse({
        repo_ref: "team/game", branch: "main", manifest_path: "deploy/game.yaml", valid: true,
        status: "valid", validation_mode: "server", resource_count: 1,
        resources: [{ api_version: "apps/v1", kind: "Deployment", namespace: "game", name: "game-server" }], warnings: [], errors: [],
      }));

    await probeRepository("team/game", "secret");
    await listRepositoryBranches("team/game");
    await listRepositoryManifestCandidates("team/game", "main");
    await validateRepositoryManifest("team/game", "main", "deploy/game.yaml", "raw-yaml");

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/repositories/discovery/probe",
      "/api/repositories/discovery/branches?repo_ref=team%2Fgame",
      "/api/repositories/discovery/manifests",
      "/api/repositories/discovery/validate",
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ repo_ref: "team/game", token: "secret" });
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toEqual({ repo_ref: "team/game", branch: "main", manifest_path: "deploy/game.yaml", source_type: "raw-yaml" });
  });
});
