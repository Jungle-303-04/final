import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  createAlertRule,
  deleteAlertRule,
  listAlertRules,
  updateAlertRule,
} from "./alert-rules";
import {
  alertRuleCreateRequestSchema,
  alertRulePatchRequestSchema,
} from "./alert-rules-schemas";

const CREATE_INPUT = {
  name: "  파드   CPU 과부하  ",
  scope: {
    clusters: ["cluster-b", "cluster-a", "cluster-a"],
    namespaces: ["cluster-a/shop"],
    applications: ["checkout"],
    labels: ["team=payments", "team=checkout"],
  },
  metric: "cpu_pct",
  comparator: ">",
  threshold: 80,
  for_seconds: 20,
  severity: "high",
  channels: [" chan-ops ", "chan-ops"],
  enabled: true,
} as const;

const RULE = {
  rule_id: "alr-1",
  name: "파드 CPU 과부하",
  scope: {
    clusters: ["cluster-a", "cluster-b"],
    namespaces: ["cluster-a/shop"],
    applications: ["checkout"],
    labels: ["team=checkout", "team=payments"],
  },
  metric: "cpu_pct",
  comparator: ">",
  threshold: 80,
  for_seconds: 20,
  severity: "high",
  channels: ["chan-ops"],
  enabled: true,
  last_fired_at: null,
  occurrence_count: 0,
  created_by: "admin-1",
  created_at: "2026-07-15T00:00:00Z",
  updated_at: "2026-07-15T00:00:00Z",
} as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("alert rule API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("canonicalizes the shared filter scope and requires a bounded duration", () => {
    expect(alertRuleCreateRequestSchema.parse(CREATE_INPUT)).toEqual({
      ...CREATE_INPUT,
      name: "파드 CPU 과부하",
      scope: RULE.scope,
      channels: ["chan-ops"],
    });

    expect(() => alertRuleCreateRequestSchema.parse({
      ...CREATE_INPUT,
      for_seconds: 0,
    })).toThrow();
    expect(() => alertRuleCreateRequestSchema.parse({
      ...CREATE_INPUT,
      scope: { ...CREATE_INPUT.scope, labels: ["missing-equals"] },
    })).toThrow();
    expect(() => alertRuleCreateRequestSchema.parse({
      ...CREATE_INPUT,
      scope: { ...CREATE_INPUT.scope, namespaces: ["missing-cluster"] },
    })).toThrow();
  });

  it("creates a rule with the canonical body and one state-changing request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ rule_id: "alr-1" }, 201),
    );

    await expect(createAlertRule(CREATE_INPUT)).resolves.toEqual({ rule_id: "alr-1" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/alert-rules");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({
        ...CREATE_INPUT,
        name: "파드 CPU 과부하",
        scope: RULE.scope,
        channels: ["chan-ops"],
      }),
    });
    expect(new Headers(init?.headers).get("x-service-csrf")).toBe("same-origin");
  });

  it("lists only responses that preserve canonical scope and duration evidence", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ rules: [RULE] }),
    );
    const controller = new AbortController();

    await expect(listAlertRules(controller.signal)).resolves.toEqual({ rules: [RULE] });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/alert-rules",
      expect.objectContaining({ method: "GET", signal: controller.signal }),
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({
      rules: [{ ...RULE, scope: { ...RULE.scope, clusters: ["cluster-b", "cluster-a"] } }],
    }));
    await expect(listAlertRules()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);

    fetchMock.mockResolvedValueOnce(jsonResponse({
      rules: [{ ...RULE, for_seconds: 0 }],
    }));
    await expect(listAlertRules()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("patches only supplied fields and rejects an empty or flapping patch locally", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...RULE, threshold: 85, for_seconds: 30 }),
    );

    await expect(updateAlertRule("alr/1", {
      threshold: 85,
      for_seconds: 30,
    })).resolves.toMatchObject({ threshold: 85, for_seconds: 30 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/alert-rules/alr%2F1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ threshold: 85, for_seconds: 30 }),
      }),
    );

    fetchMock.mockClear();
    expect(() => alertRulePatchRequestSchema.parse({})).toThrow();
    expect(() => updateAlertRule("alr-1", { for_seconds: 0 })).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes an encoded rule identity only when the server returns no content", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await expect(deleteAlertRule("alr/1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/alert-rules/alr%2F1",
      expect.objectContaining({ method: "DELETE", credentials: "include" }),
    );
    expect(() => deleteAlertRule(" ")).toThrow("ruleId must not be empty");
  });

  it("preserves the structured missing-channel validation error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      detail: {
        code: "alert_channel_not_found",
        detail: "선택한 알림 채널을 찾을 수 없습니다.",
      },
    }, 422));

    await expect(createAlertRule(CREATE_INPUT)).rejects.toMatchObject({
      kind: "invalid-request",
      status: 422,
      code: "alert_channel_not_found",
      detail: "선택한 알림 채널을 찾을 수 없습니다.",
    } satisfies Partial<ApiError>);
  });
});
