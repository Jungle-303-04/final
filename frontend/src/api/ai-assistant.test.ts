import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAiSuggestions, postAiChat } from "./ai-assistant";

const CONTEXT = {
  screen: "resources",
  filters: {
    clusters: ["cluster-1"],
    namespaces: ["cluster-1/shop"],
    applications: [],
    labels: ["team=checkout"],
    resource_types: ["pod"],
    health: [],
    query: "checkout",
  },
  selection: { type: "resource" as const, identity: "Pod/shop/checkout-api-0" },
  time: null,
  log_stream_id: null,
};

describe("AI assistant API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("posts exact screen context and accepts only evidence-linked answers", async () => {
    const controller = new AbortController();
    const response = {
      answer: "The Pod is restarting because the container exited.",
      evidence: [{
        type: "inventory-event",
        id: "event-1",
        label: "BackOff event",
        link: "/resources?detail=Event%2Fshop%2Fcheckout-warning",
      }],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(response));

    await expect(postAiChat(CONTEXT, " Why is it restarting? ", controller.signal))
      .resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/chat",
      expect.objectContaining({
        body: JSON.stringify({ context: CONTEXT, message: "Why is it restarting?" }),
        method: "POST",
        signal: controller.signal,
      }),
    );
  });

  it("serializes the same context for suggestions", async () => {
    const response = { suggestions: [{ id: "why", label: "Why?", prompt: "Why is it failing?" }] };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(response));

    await expect(getAiSuggestions(CONTEXT)).resolves.toEqual(response);
    const expected = `/api/ai/suggestions?context=${encodeURIComponent(JSON.stringify(CONTEXT))}`;
    expect(fetchMock).toHaveBeenCalledWith(expected, expect.objectContaining({ method: "GET" }));
  });

  it("accepts only the allowlisted, fully validated alert action payload", async () => {
    const response = {
      answer: "Review the alert rule proposal.",
      evidence: [{ type: "inventory-resource", id: "pod-1", label: "Pod", link: "/resources" }],
      action: {
        type: "create_alert_rule",
        rationale: "Current cluster scope",
        payload: {
          name: "CPU 70%",
          scope: { clusters: ["cluster-1"], namespaces: [], applications: [], labels: [] },
          metric: "cpu_pct",
          comparator: ">",
          threshold: 70,
          for_seconds: 20,
          severity: "high",
          channels: [],
          enabled: true,
        },
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(response));
    await expect(postAiChat(CONTEXT, "CPU 70% alert")).resolves.toEqual(response);
  });

  it("rejects unsafe evidence links and malformed context", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      answer: "Open this link",
      evidence: [{ type: "x", id: "1", label: "bad", link: "https://evil.example" }],
    }));
    await expect(postAiChat(CONTEXT, "why"))
      .rejects.toMatchObject({ kind: "invalid-payload" });
    expect(() => getAiSuggestions({ ...CONTEXT, screen: "" })).toThrow();
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
