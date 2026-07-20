// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import type { AiConversationHistoryPort } from "../../features/ai-assistant/aiConversationHistoryContract";
import {
  closeAiConversation,
  currentAiConversationSession,
} from "../../features/ai-assistant/aiConversationSession";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../../shared/i18n";
import { AiHistoryPage } from "./AiHistoryPage";

afterEach(() => {
  closeAiConversation();
  cleanup();
});

describe("AI conversation history surface", () => {
  it("renders the demo-v3 row grammar and resumes a persisted conversation", async () => {
    const port = historyPort();
    renderPage(port, ["/ai?clusters=prod-eks"]);

    expect(await screen.findByRole("heading", { name: "AI 대화" })).toBeTruthy();
    expect(screen.getByText("메모리 한도 초과 근거를 확인했습니다.")).toBeTruthy();
    expect(screen.getByText("이슈")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", {
      name: "redis-605 OOMKilled 원인 분석 대화 이어서 열기",
    }));

    expect(currentAiConversationSession()).toMatchObject({
      mode: "resume",
      conversationId: "aic-605",
    });
  });

  it("starts a saved conversation with the current real filter context", async () => {
    renderPage(historyPort(), ["/ai?clusters=prod-eks&applications=shop-api"]);

    await userEvent.click(await screen.findByRole("button", { name: "새 대화" }));

    expect(currentAiConversationSession()).toMatchObject({
      mode: "new",
      context: {
        clusterId: "prod-eks",
        applicationId: "shop-api",
        locale: "ko",
      },
    });
  });

  it("keeps a stable loading frame and offers an executable new-conversation action", async () => {
    const pending = deferred<Awaited<ReturnType<AiConversationHistoryPort["list"]>>>();
    const port = historyPort();
    vi.mocked(port.list).mockReturnValue(pending.promise);
    renderPage(port, ["/ai"]);

    expect(screen.getByRole("button", { name: "새 대화" })).toBeTruthy();
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();

    pending.resolve({ completeness: "complete", items: [], partialConversationIds: [] });
    expect(await screen.findByText("첫 AI 대화를 시작하세요")).toBeTruthy();
  });

  it("recovers a failed history request and keeps the empty state actionable", async () => {
    const port = historyPort();
    vi.mocked(port.list)
      .mockRejectedValueOnce(new Error("history unavailable"))
      .mockResolvedValue({ completeness: "complete", items: [], partialConversationIds: [] });
    renderPage(port, ["/ai?clusters=prod-eks"]);

    expect(await screen.findByRole("heading", { name: "대화 내역을 불러올 수 없습니다" }))
      .toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("첫 AI 대화를 시작하세요")).toBeTruthy();
    expect(port.list).toHaveBeenCalledTimes(2);

    const newConversationActions = screen.getAllByRole("button", { name: "새 대화" });
    await userEvent.click(newConversationActions[newConversationActions.length - 1]!);
    await waitFor(() => expect(currentAiConversationSession()).toMatchObject({
      mode: "new",
      context: { clusterId: "prod-eks", locale: "ko" },
    }));
  });
});

function renderPage(port: AiConversationHistoryPort, entries: string[]) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <MemoryRouter initialEntries={entries}>
        <UnifiedFilterProvider>
          <AiHistoryPage port={port} />
        </UnifiedFilterProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

function historyPort(): AiConversationHistoryPort {
  return {
    list: vi.fn().mockResolvedValue({
      completeness: "complete",
      partialConversationIds: [],
      items: [{
        id: "aic-605",
        title: "redis-605 OOMKilled 원인 분석",
        preview: "메모리 한도 초과 근거를 확인했습니다.",
        contextKind: "issue",
        contextValue: "inc-605",
        status: "completed",
        updatedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
        detailAvailable: true,
      }],
    }),
    load: vi.fn(),
    create: vi.fn(),
    append: vi.fn(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}
