import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getBrowserRefreshPolicies,
  REFRESH_POLICIES_PATH,
} from "./refresh-policies";
import { refreshPolicyKeys } from "./refresh-policies-schemas";

describe("browser refresh policy API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("accepts only the complete server-owned refresh inventory", async () => {
    const fixture = policies();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(fixture));

    await expect(getBrowserRefreshPolicies()).resolves.toMatchObject({
      policies: {
        helm_detail: { refresh_after_seconds: 10 },
        cost_summary: { refresh_after_seconds: 60 },
      },
    });
    expect(REFRESH_POLICIES_PATH).toBe("/api/refresh-policies");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(REFRESH_POLICIES_PATH);

    const { port_sessions: _missing, ...incomplete } = fixture.policies;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...fixture,
      policies: incomplete,
    }));
    await expect(getBrowserRefreshPolicies()).rejects.toMatchObject({
      kind: "invalid-payload",
    });
  });
});

function policies() {
  const policy = {
    stale_after_seconds: 30,
    refresh_after_seconds: 60,
    keep_last_success: true,
    pause_when_hidden: true,
    event_invalidation: false,
    retry_after_seconds: null,
    retry_limit: null,
    post_mutation_refresh_after_seconds: null,
  };
  return {
    revision: "a".repeat(64),
    policies: Object.fromEntries(refreshPolicyKeys.map((key) => [
      key,
      {
        ...policy,
        refresh_after_seconds: key === "helm_detail" ? 10 : 60,
      },
    ])),
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
