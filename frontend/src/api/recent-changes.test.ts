import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  getIncidentRecentChanges as publicGetIncidentRecentChanges,
  RCA_RECENT_CHANGES_DEFAULT_LIMIT,
  RCA_RECENT_CHANGES_MAX_LIMIT,
  RCA_RECENT_CHANGES_PATH,
  recentChangeListResponseSchema as publicRecentChangeListResponseSchema,
} from "./index";
import { getIncidentRecentChanges } from "./recent-changes";
import { recentChangeListResponseSchema } from "./recent-changes-schemas";

const CHANGE_ONE = {
  event_id: "event-change-1",
  changed_at: "2026-07-13T03:59:00+00:00",
  namespace: "shop",
  resource_kind: "Deployment",
  resource_name: "checkout-api",
  image_before: "registry.example/checkout:v1",
  image_after: "registry.example/checkout:v2",
  pr_url: "https://github.com/acme/platform/pull/42",
  commit_sha: "0123456789abcdef",
  repository_id: "repository-1",
  repo_ref: "github.com/acme/platform",
  workflow_run_id: "workflow-run-1",
};

const CHANGE_TWO = {
  ...CHANGE_ONE,
  event_id: "event-change-2",
  changed_at: "2026-07-13T03:58:00+00:00",
  image_before: null,
  image_after: null,
  pr_url: null,
  commit_sha: "fedcba9876543210",
  workflow_run_id: "workflow-run-2",
};

const RECENT_CHANGES = {
  incident_id: "incident-1",
  items: [CHANGE_ONE, CHANGE_TWO],
  limit: 5,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("incident recent changes API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exports the verified endpoint and strict response schema", () => {
    expect(publicGetIncidentRecentChanges).toBe(getIncidentRecentChanges);
    expect(publicRecentChangeListResponseSchema).toBe(recentChangeListResponseSchema);
    expect(RCA_RECENT_CHANGES_DEFAULT_LIMIT).toBe(5);
    expect(RCA_RECENT_CHANGES_MAX_LIMIT).toBe(50);
    expect(RCA_RECENT_CHANGES_PATH)
      .toBe("/api/rca/incidents/{incident_id}/recent-changes");
  });

  it("preserves server order, workload identity, and nullable references", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(RECENT_CHANGES),
    );

    const result = await getIncidentRecentChanges("incident-1");

    expect(result).toEqual(RECENT_CHANGES);
    expect(result.items.map(({ event_id }) => event_id)).toEqual([
      "event-change-1",
      "event-change-2",
    ]);
    expect(result.items[1]?.image_before).toBeNull();
    expect(result.items[1]?.pr_url).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rca/incidents/incident-1/recent-changes?limit=5",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("accepts an empty successful list without inventing a change", async () => {
    const payload = { incident_id: "incident-1", items: [], limit: 5 };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getIncidentRecentChanges("incident-1")).resolves.toEqual(payload);
  });

  it("encodes the incident id, forwards limit, and preserves AbortSignal", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    await expect(getIncidentRecentChanges("incident / #1", {
      limit: 17,
      signal: controller.signal,
    })).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rca/incidents/incident%20%2F%20%231/recent-changes?limit=17",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("normalizes surrounding whitespace before substituting the path template", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(RECENT_CHANGES),
    );

    await getIncidentRecentChanges("  incident-1  ");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rca/incidents/incident-1/recent-changes?limit=5",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it.each([
    ["response", { ...RECENT_CHANGES, total: 2 }],
    ["item", {
      ...RECENT_CHANGES,
      items: [{ ...CHANGE_ONE, workspace_id: "must-not-leak" }],
    }],
  ])("rejects unknown %s fields as contract drift", async (_layer, payload) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getIncidentRecentChanges("incident-1")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it.each([
    ["missing event id", {
      ...RECENT_CHANGES,
      items: [{ ...CHANGE_ONE, event_id: undefined }],
    }],
    ["missing nullable image key", {
      ...RECENT_CHANGES,
      items: [{ ...CHANGE_ONE, image_before: undefined }],
    }],
    ["fractional limit", { ...RECENT_CHANGES, limit: 1.5 }],
  ])("rejects malformed %s responses", async (_case, payload) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getIncidentRecentChanges("incident-1")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it.each([
    ["blank incident", "", {}],
    ["zero limit", "incident-1", { limit: 0 }],
    ["fractional limit", "incident-1", { limit: 1.5 }],
    ["oversized limit", "incident-1", { limit: 51 }],
  ])("rejects %s before making a request", async (_case, incidentId, options) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(getIncidentRecentChanges(incidentId, options)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves concealed incidents as not-found errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "incident recent changes not found" }, 404),
    );

    await expect(getIncidentRecentChanges("missing")).rejects.toMatchObject({
      kind: "not-found",
      status: 404,
      detail: "incident recent changes not found",
    } satisfies Partial<ApiError>);
  });
});
