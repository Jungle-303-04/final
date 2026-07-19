import { describe, expect, it, vi } from "vitest";

import { createAiConversationHistoryAdapter } from "./createAiConversationHistoryAdapter";

const COMPLETE_PAGE = {
  limit: 20,
  has_more: false,
  next_cursor: null,
  messages_completeness: "complete" as const,
  partial_reason_codes: [],
};

describe("persisted AI conversation history adapter", () => {
  it("hydrates the list from real conversation details without inventing preview data", async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({
        conversation: {
          conversation_id: "aic-issue",
          title: "redis-605 OOMKilled root cause",
          status: "completed",
          context: { incident_id: "inc-605" },
          updated_at: "2026-07-20T00:10:00Z",
        },
        messages: [
          {
            message_id: "aim-user",
            role: "user",
            content: "Why did redis restart?",
            created_at: "2026-07-20T00:09:00Z",
          },
          {
            message_id: "aim-answer",
            role: "assistant",
            content: "The observed working set crossed the configured memory limit.",
            created_at: "2026-07-20T00:10:00Z",
          },
        ],
        ...COMPLETE_PAGE,
      })
      .mockRejectedValueOnce(Object.assign(new Error("upstream unavailable"), { status: 503 }));
    const port = createAiConversationHistoryAdapter({
      append: vi.fn(),
      create: vi.fn(),
      get,
      list: vi.fn().mockResolvedValue({
        conversations: [
          {
            conversation_id: "aic-issue",
            title: "redis-605 OOMKilled root cause",
            status: "completed",
            updated_at: "2026-07-20T00:10:00Z",
          },
          {
            conversation_id: "aic-deploy",
            title: "shop-api deployment",
            status: "waiting",
            updated_at: "2026-07-20T00:05:00Z",
          },
        ],
      }),
    });

    await expect(port.list()).resolves.toEqual({
      completeness: "partial",
      partialConversationIds: ["aic-deploy"],
      items: [
        expect.objectContaining({
          id: "aic-issue",
          preview: "The observed working set crossed the configured memory limit.",
          contextKind: "issue",
          contextValue: "inc-605",
          detailAvailable: true,
        }),
        expect.objectContaining({
          id: "aic-deploy",
          preview: null,
          detailAvailable: false,
        }),
      ],
    });
    expect(get).toHaveBeenNthCalledWith(1, "aic-issue", undefined, { limit: 20 });
  });

  it("keeps a resumed conversation's stored context when appending", async () => {
    const append = vi.fn().mockResolvedValue({
      accepted: true,
      conversation_id: "aic-1",
      message_id: "aim-2",
      event_id: "evt-2",
      correlation_id: "corr-2",
    });
    const port = createAiConversationHistoryAdapter({
      append,
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
    });

    await port.append("aic-1", "Continue with the existing incident context");

    expect(append).toHaveBeenCalledWith(
      "aic-1",
      { message: "Continue with the existing incident context" },
      undefined,
    );
  });

  it("maps malformed stored data to an explicit invalid-response failure", async () => {
    const port = createAiConversationHistoryAdapter({
      append: vi.fn(),
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn().mockResolvedValue({ conversations: [{ title: "missing id" }] }),
    });

    await expect(port.list()).rejects.toMatchObject({
      code: "invalid-response",
      name: "AiConversationHistoryFailure",
    });
  });
});
