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
    });

    await expect(port.ask(CONTEXT, "Why?")).resolves.toEqual({
      answer: "BackOff is observed.",
      evidence: [{ type: "event", id: "1", label: "BackOff", link: "/issues/1" }],
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
});
