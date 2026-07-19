import { afterEach, describe, expect, it, vi } from "vitest";

import { listRepositoryManifests } from "./repository-discovery";

afterEach(() => vi.restoreAllMocks());

describe("repository discovery API", () => {
  it("posts the server-selected repository and branch to manifest discovery", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      repo_ref: "team/inventory-api",
      branch: "main",
      candidates: [],
      warnings: [],
    }), { headers: { "content-type": "application/json" } }));

    await listRepositoryManifests("team/inventory-api", "main");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/repositories/discovery/manifests",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      repo_ref: "team/inventory-api",
      branch: "main",
    });
  });
});
