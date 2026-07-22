import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { getRepositoryConnectionStatus } from "./repository-connection";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const READY = {
  repo_ref: "jungle-303-04/demo-game",
  repository_id: "repo-demo-game",
  repository_status: "active",
  connection_stage: "ready",
  terminal: true,
  refresh_after_seconds: null,
};

describe("repository connection API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads a ready repository registration using the encoded repo ref", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(READY));

    await expect(getRepositoryConnectionStatus("jungle-303-04/demo-game")).resolves.toEqual(READY);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/repositories/connection-status?repo_ref=jungle-303-04%2Fdemo-game",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("rejects a non-contracted lifecycle payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...READY, connection_stage: "syncing" }),
    );

    await expect(getRepositoryConnectionStatus("jungle-303-04/demo-game")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });
});
