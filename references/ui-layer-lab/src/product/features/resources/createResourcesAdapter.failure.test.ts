import { describe, expect, it, vi } from "vitest";
import { ResourcesPortFailure } from "./resourcesContract";
import { createResourcesAdapter } from "./createResourcesAdapter";
import { endpoints } from "./createResourcesAdapter.testSupport";

describe("Resources adapter failure mapping", () => {
  it.each([
    [{ kind: "unauthorized", status: 401 }, "unauthorized"],
    [{ kind: "forbidden", status: 403 }, "forbidden"],
    [{ kind: "not-found", status: 404 }, "not-found"],
    [{ kind: "invalid-request", status: 422 }, "invalid-request"],
    [{ kind: "rate-limited", status: 429, retryAfter: 12 }, "rate-limited"],
    [{ kind: "network" }, "offline"],
    [{ kind: "invalid-payload", status: 200 }, "invalid-response"],
    [{ kind: "http", status: 503, retryAfter: 5 }, "unavailable"],
    [{ kind: "http", status: 500 }, "error"],
  ] as const)("maps transport %j to %s", async (transport, code) => {
    const port = createResourcesAdapter(endpoints({
      getInventorySummary: vi.fn().mockRejectedValue(transport),
    }));

    await expect(port.loadCatalog("cluster-1")).rejects.toMatchObject({
      code,
      retryAfterSeconds: "retryAfter" in transport ? transport.retryAfter : null,
    });
  });

  it("maps status 503 even when the transport kind is not specialized", async () => {
    await expect(createResourcesAdapter(endpoints({
      getInventorySummary: vi.fn().mockRejectedValue({ status: 503 }),
    })).loadCatalog("cluster-1")).rejects.toMatchObject({ code: "unavailable" });
  });

  it("does not leak malformed retry metadata", async () => {
    await expect(createResourcesAdapter(endpoints({
      getInventorySummary: vi.fn().mockRejectedValue({
        kind: "rate-limited",
        retryAfter: -1,
      }),
    })).loadCatalog("cluster-1")).rejects.toMatchObject({
      code: "rate-limited",
      retryAfterSeconds: null,
    });
  });

  it("preserves AbortError identity", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });

    await expect(createResourcesAdapter(endpoints({
      getInventorySummary: vi.fn().mockRejectedValue(abortError),
    })).loadCatalog("cluster-1")).rejects.toBe(abortError);
  });

  it("preserves an existing ResourcesPortFailure", async () => {
    const failure = new ResourcesPortFailure("forbidden");

    await expect(createResourcesAdapter(endpoints({
      getInventorySummary: vi.fn().mockRejectedValue(failure),
    })).loadCatalog("cluster-1")).rejects.toBe(failure);
  });
});
