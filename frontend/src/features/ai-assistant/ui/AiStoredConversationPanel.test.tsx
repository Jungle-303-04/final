// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../../shared/i18n";
import type { AiConversationHistoryPort } from "../aiConversationHistoryContract";
import {
  closeAiConversation,
  currentAiConversationSession,
} from "../aiConversationSession";
import { AiStoredConversationPanel } from "./AiStoredConversationPanel";

afterEach(() => {
  closeAiConversation();
  cleanup();
});

describe("stored AI conversation panel", () => {
  it("creates and saves a new conversation before switching to resume mode", async () => {
    const port = panelPort();
    renderPanel(port, {
      mode: "new",
      context: { clusterId: "prod-eks", locale: "ko" },
      revision: 1,
    });

    await userEvent.type(
      screen.getByRole("textbox", { name: "지금 보고 있는 것에 대해 질문하세요…" }),
      "redis 파드가 왜 재시작됐어?",
    );
    await userEvent.click(screen.getByRole("button", { name: "질문" }));

    expect(port.create).toHaveBeenCalledWith(
      "redis 파드가 왜 재시작됐어?",
      { clusterId: "prod-eks", locale: "ko" },
      expect.any(AbortSignal),
    );
    expect(currentAiConversationSession()).toMatchObject({
      mode: "resume",
      conversationId: "aic-new",
    });
  });

  it("loads an existing transcript and appends without replacing its stored context", async () => {
    const port = panelPort();
    renderPanel(port, {
      mode: "resume",
      conversationId: "aic-605",
      revision: 2,
    });

    expect(await screen.findByText("메모리 한도 초과가 관측됐습니다.")).toBeTruthy();
    await userEvent.type(
      screen.getByRole("textbox", { name: "지금 보고 있는 것에 대해 질문하세요…" }),
      "근거를 더 보여줘",
    );
    await userEvent.click(screen.getByRole("button", { name: "질문" }));

    expect(port.append).toHaveBeenCalledWith(
      "aic-605",
      "근거를 더 보여줘",
      undefined,
      expect.any(AbortSignal),
    );
  });

  it("restores a failed request into the draft without automatically resending it", async () => {
    const port = panelPort();
    vi.mocked(port.load).mockResolvedValue({
      id: "aic-failed",
      title: "파드 재시작 진단",
      contextKind: "cluster",
      contextValue: "prod-eks",
      status: "failed",
      updatedAt: "2026-07-20T00:10:00Z",
      messages: [{
        id: "aim-user",
        role: "user",
        content: "왜 파드가 재시작됐어?",
        createdAt: "2026-07-20T00:09:00Z",
      }, {
        id: "aim-assistant",
        role: "assistant",
        content: "AI 공급자의 요청 한도에 도달해 진단을 생성하지 못했습니다.",
        createdAt: "2026-07-20T00:10:00Z",
        failure: { code: "rate_limited", retryable: true },
      }],
      hasMore: false,
      messagesCompleteness: "complete",
    });
    renderPanel(port, {
      mode: "resume",
      conversationId: "aic-failed",
      revision: 3,
    });

    expect(await screen.findByText("안전 실패 코드: rate_limited")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "질문 복원" }));

    expect((screen.getByRole("textbox", {
      name: "지금 보고 있는 것에 대해 질문하세요…",
    }) as HTMLTextAreaElement).value).toBe("왜 파드가 재시작됐어?");
    expect(port.append).not.toHaveBeenCalled();
  });
});

function renderPanel(
  port: AiConversationHistoryPort,
  session: Parameters<typeof AiStoredConversationPanel>[0]["session"],
) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <AiStoredConversationPanel
        currentContext={{ clusterId: "prod-eks", locale: "ko" }}
        onShowHistory={vi.fn()}
        port={port}
        session={session}
      />
    </I18nProvider>,
  );
}

function panelPort(): AiConversationHistoryPort {
  return {
    list: vi.fn(),
    load: vi.fn().mockResolvedValue({
      id: "aic-605",
      title: "redis-605 OOMKilled 원인 분석",
      contextKind: "issue",
      contextValue: "inc-605",
      status: "completed",
      updatedAt: "2026-07-20T00:10:00Z",
      messages: [{
        id: "aim-answer",
        role: "assistant",
        content: "메모리 한도 초과가 관측됐습니다.",
        createdAt: "2026-07-20T00:10:00Z",
      }],
      hasMore: false,
      messagesCompleteness: "complete",
    }),
    create: vi.fn().mockResolvedValue({
      conversationId: "aic-new",
      messageId: "aim-new",
    }),
    append: vi.fn().mockResolvedValue({
      conversationId: "aic-605",
      messageId: "aim-next",
    }),
  };
}
