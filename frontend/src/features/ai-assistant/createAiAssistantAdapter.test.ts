import { describe, expect, it, vi } from "vitest";

import type { AiAssistantContext } from "./aiAssistantContract";
import { createAiAssistantAdapter } from "./createAiAssistantAdapter";

const CONTEXT: AiAssistantContext = {
  screen: "resources",
  filters: {
    clusters: ["cluster-1"],
    namespaces: [],
    applications: [],
    labels: [],
    resourceTypes: ["pod"],
    health: [],
    query: "",
  },
  selection: { type: "resource", identity: "Pod/shop/checkout-api-0" },
  time: null,
  logStreamId: "stream-command-1",
};

describe("AI assistant adapter", () => {
  it("maps canonical filters and preserves evidence links", async () => {
    const postAiChat = vi.fn().mockResolvedValue({
      answer: "BackOff is observed.",
      evidence: [{ type: "event", id: "1", label: "BackOff", link: "/issues/1" }],
    });
    const port = createAiAssistantAdapter({
      postAiChat,
      getAiSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
      createAlertRule: vi.fn(),
    });

    await expect(port.ask(CONTEXT, "Why?")).resolves.toEqual({
      answer: "BackOff is observed.",
      evidence: [{ type: "event", id: "1", label: "BackOff", link: "/issues/1" }],
      action: null,
    });
    expect(postAiChat).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ resource_types: ["pod"] }),
        log_stream_id: "stream-command-1",
      }),
      "Why?",
      undefined,
    );
  });

  it("maps the single allowlisted alert proposal and executes only after confirmation", async () => {
    const createAlertRule = vi.fn().mockResolvedValue({ rule_id: "rule-1" });
    const port = createAiAssistantAdapter({
      getAiSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
      postAiChat: vi.fn().mockResolvedValue({
        answer: "Review this proposal.",
        evidence: [{ type: "event", id: "1", label: "CPU", link: "/resources" }],
        action: {
          type: "create_alert_rule",
          rationale: "Current cluster CPU threshold",
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
      }),
      createAlertRule,
    });

    const answer = await port.ask(CONTEXT, "Alert me at 70%");
    expect(createAlertRule).not.toHaveBeenCalled();
    expect(answer.action?.payload.forSeconds).toBe(20);
    await expect(port.createAlertRule(answer.action!)).resolves.toEqual({ ruleId: "rule-1" });
    expect(createAlertRule).toHaveBeenCalledWith(expect.objectContaining({
      for_seconds: 20,
      scope: expect.objectContaining({ clusters: ["cluster-1"] }),
    }), undefined);
  });
});
