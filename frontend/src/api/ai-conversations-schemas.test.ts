import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  createAiConversation,
  getAiConversation,
  listAiConversations,
} from "./ai-conversations";

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("AI conversation response schemas", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("keeps conversation and message JsonMap values open", async () => {
    const payload = {
      conversation: {
        conversation_id: "aic-123",
        status: "provider_defined_waiting",
        future_context: { nested: ["preserved"] },
      },
      messages: [{
        role: "assistant",
        tool_metadata: { call_id: "tool-1", result: { ok: true } },
      }],
      limit: 100,
      has_more: false,
      next_cursor: null,
      messages_completeness: "complete",
      partial_reason_codes: [],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(getAiConversation("aic-123")).resolves.toEqual(payload);
  });

  it("rejects unknown list and detail envelope fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      conversations: [],
      cursor: "pagination-is-not-contracted",
    }));
    await expect(listAiConversations()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      conversation: { conversation_id: "aic-123" },
      messages: [],
      limit: 100,
      has_more: false,
      next_cursor: null,
      messages_completeness: "complete",
      partial_reason_codes: [],
      processing: true,
    }));
    await expect(getAiConversation("aic-123")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("rejects inconsistent bounded-history pagination state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      conversation: { conversation_id: "aic-123" },
      messages: [],
      limit: 100,
      has_more: true,
      next_cursor: null,
      messages_completeness: "complete",
      partial_reason_codes: [],
    }));

    await expect(getAiConversation("aic-123")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("keeps the accepted receipt strict and requires every identifier", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      accepted: true,
      conversation_id: "aic-123",
      message_id: "aim-123",
      event_id: "evt-123",
      correlation_id: "corr-123",
      status: "invented",
    }));
    await expect(createAiConversation({ message: "Start" })).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      accepted: true,
      conversation_id: "aic-123",
      message_id: "aim-123",
      event_id: "evt-123",
    }));
    await expect(createAiConversation({ message: "Start" })).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });
});
