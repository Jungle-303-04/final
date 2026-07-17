// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AiAssistantPort } from "../features/ai-assistant/aiAssistantContract";
import {
  installMatchMedia,
  renderShell,
} from "./__tests__/ProductShellInteractionSupport";

beforeEach(() => installMatchMedia(false));
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("ProductShell AI panel", () => {
  it("opens from the right, hides its floating trigger, and keeps complete suggestions", async () => {
    const user = userEvent.setup();
    const port = assistantPort({
      loadSuggestions: vi.fn().mockResolvedValue([
        { id: "why", label: "재시작 원인", prompt: "이 파드는 왜 재시작하나요?" },
      ]),
    });
    const { container } = renderShell({ aiAssistantPort: port });
    const closedPanel = container.querySelector('[data-slot="ai-assistant-panel"]');
    expect(closedPanel?.getAttribute("aria-hidden")).toBe("true");
    expect(closedPanel?.hasAttribute("inert")).toBe(true);
    const trigger = screen.getByRole("button", { name: "Opsia AI 열기" });
    expect(trigger.className).toContain("fixed");
    expect(trigger.className).toContain("right-[var(--product-floating-action-inline-inset)]");
    expect(trigger.className).toContain("bottom-[var(--product-floating-action-block-end)]");
    expect(trigger.className).toContain("size-[var(--product-floating-action-size)]");

    await user.click(trigger);
    const panel = screen.getByRole("complementary", { name: "Opsia AI" });
    const inner = panel.querySelector('[data-slot="ai-assistant-inner"]');
    expect(panel.getAttribute("data-side")).toBe("right");
    expect(panel.getAttribute("aria-hidden")).toBe("false");
    expect(panel.hasAttribute("inert")).toBe(false);
    expect(panel.getAttribute("data-open")).toBe("true");
    expect(panel.getAttribute("data-width")).toBe("420");
    expect(inner?.getAttribute("data-inner-width")).toBe("420");
    expect(panel.previousElementSibling?.id).toBe("product-main");
    expect(screen.queryByRole("button", { name: "Opsia AI 열기" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Opsia AI 닫기" })).toHaveLength(1);
    expect(await screen.findByRole("button", { name: "이 파드는 왜 재시작하나요?" }))
      .toBeTruthy();
    expect(screen.queryByRole("button", { name: "재시작 원인" })).toBeNull();
    expect(panel.textContent).toContain("home");
    expect(panel.textContent).toContain("cluster-1");

    fireEvent.keyDown(screen.getByRole("separator", { name: "AI 패널 너비 조절" }), {
      key: "ArrowLeft",
    });
    expect(panel.getAttribute("data-width")).toBe("440");
    expect(inner?.getAttribute("data-inner-width")).toBe("440");
  });

  it("never renders an answer without evidence and links a supported answer", async () => {
    const user = userEvent.setup();
    const ask = vi.fn()
      .mockResolvedValueOnce({ answer: "unsupported-answer", evidence: [] })
      .mockResolvedValueOnce({
        answer: "BackOff 이벤트가 관측됐습니다.",
        evidence: [{
          type: "event",
          id: "event-1",
          label: "BackOff event",
          link: "/issues/event-1" as const,
        }],
      });
    renderShell({ aiAssistantPort: assistantPort({ ask }) });
    await user.click(screen.getByRole("button", { name: "Opsia AI 열기" }));
    const input = screen.getByRole("textbox", { name: "지금 보고 있는 것에 대해 질문하세요…" });

    await user.type(input, "첫 질문");
    await user.click(screen.getByRole("button", { name: "질문" }));
    expect(await screen.findByText("그 답을 뒷받침할 근거 데이터가 없습니다.")).toBeTruthy();
    expect(screen.queryByText("unsupported-answer")).toBeNull();

    await user.type(input, "두 번째 질문");
    await user.click(screen.getByRole("button", { name: "질문" }));
    expect(await screen.findByText("BackOff 이벤트가 관측됐습니다.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /BackOff event/u }).getAttribute("href"))
      .toBe("/issues/event-1");
  });

  it("renders an explicit capability answer without operational evidence", async () => {
    const user = userEvent.setup();
    const answer = "현재 인벤토리와 저장된 로그 근거를 설명할 수 있습니다.";
    renderShell({
      aiAssistantPort: assistantPort({
        ask: vi.fn().mockResolvedValue({
          answer,
          evidence: [],
          action: null,
          answerKind: "capability",
        }),
      }),
    });
    await user.click(screen.getByRole("button", { name: "Opsia AI 열기" }));
    const input = screen.getByRole("textbox", { name: "지금 보고 있는 것에 대해 질문하세요…" });

    await user.type(input, "넌 뭘 할 수 있니?");
    await user.click(screen.getByRole("button", { name: "질문" }));

    expect(await screen.findByText(answer)).toBeTruthy();
    expect(screen.queryByText("그 답을 뒷받침할 근거 데이터가 없습니다.")).toBeNull();
  });

  it("updates AI conversation and pending-action labels immediately with locale", async () => {
    const user = userEvent.setup();
    renderShell({
      aiAssistantPort: assistantPort({
        ask: vi.fn(() => new Promise<never>(() => undefined)),
      }),
    });
    await user.click(screen.getByRole("button", { name: "Opsia AI 열기" }));
    expect(screen.getByRole("log", { name: "AI 대화" })).toBeTruthy();

    await user.click(screen.getByRole("combobox", { name: "현재 언어: 한국어" }));
    await user.click(await screen.findByRole("option", { name: "영어" }));

    expect(screen.getByRole("log", { name: "AI conversation" })).toBeTruthy();
    const input = screen.getByRole("textbox", { name: "Ask about what you are viewing…" });
    await user.type(input, "What changed?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByRole("button", { name: "Stop" })).toBeTruthy();
  });

  it("submits with Enter, keeps Shift+Enter in the input, scrolls, and aborts a pending turn", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    let requestSignal: AbortSignal | undefined;
    const ask = vi.fn((_context, _message, signal?: AbortSignal) => {
      requestSignal = signal;
      return new Promise<never>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    renderShell({ aiAssistantPort: assistantPort({ ask }) });
    await user.click(screen.getByRole("button", { name: "Opsia AI 열기" }));
    const input = screen.getByRole("textbox", { name: "지금 보고 있는 것에 대해 질문하세요…" });

    await user.type(input, "첫 줄");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(ask).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(ask).toHaveBeenCalledOnce());
    expect(ask.mock.calls[0]?.[1]).toBe("첫 줄");
    expect(requestSignal).toBeInstanceOf(AbortSignal);
    expect(screen.getByText("첫 줄")).toBeTruthy();
    expect(screen.getByRole("button", { name: "중단" })).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "중단" }));
    expect(requestSignal?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByRole("button", { name: "중단" })).toBeNull());
    expect(screen.queryByText("이 요청에는 AI를 사용할 수 없습니다.")).toBeNull();
  });

  it("keeps an open detail and the user-selected sidebar state on wide screens", async () => {
    const user = userEvent.setup();
    renderShell({
      aiAssistantPort: assistantPort(),
      initialEntry: "/resources?clusters=cluster-1&resources.types=pod" +
        "&detail=Pod%2Fshop%2Fcheckout-api-0",
      releasedSurfaceIds: new Set(["home", "resources"]),
    });
    const sidebar = screen.getByRole("complementary", { name: "제품 메뉴" });
    expect(sidebar.getAttribute("data-state")).toBe("expanded");

    await user.click(screen.getByRole("button", { name: "Opsia AI 열기" }));
    const panel = screen.getByRole("complementary", { name: "Opsia AI" });
    expect(panel.previousElementSibling?.id).toBe("product-main");
    expect(sidebar.getAttribute("data-state")).toBe("expanded");
    expect(screen.getByTestId("resources-shortcut")).toBeTruthy();
  });

  it("closes detail with an explicit toast before giving AI priority below 896px", async () => {
    installMatchMedia(true);
    const user = userEvent.setup();
    const { container } = renderShell({
      aiAssistantPort: assistantPort(),
      initialEntry: "/resources?clusters=cluster-1&resources.types=pod" +
        "&detail=Pod%2Fshop%2Fcheckout-api-0",
      releasedSurfaceIds: new Set(["home", "resources"]),
    });
    expect(container.querySelectorAll('[data-slot="unified-filter-bar"]')).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Opsia AI 열기" }));
    const panel = screen.getByRole("complementary", { name: "Opsia AI" });
    await waitFor(() => expect(container.querySelectorAll('[data-slot="unified-filter-bar"]')).toHaveLength(1));
    expect(panel.className).toContain("max-w-dvw");
    expect(panel.querySelector('[data-slot="ai-assistant-inner"]')?.className)
      .toContain("max-w-dvw");
    expect(screen.queryByRole("button", { name: "Opsia AI 열기" })).toBeNull();
    expect(await screen.findByText(
      "Opsia AI 공간을 확보하기 위해 리소스 상세를 닫았습니다.",
    )).toBeTruthy();
  });
});

function assistantPort(overrides: Partial<AiAssistantPort> = {}): AiAssistantPort {
  return {
    ask: vi.fn().mockResolvedValue({ answer: "no data", evidence: [], action: null }),
    loadSuggestions: vi.fn().mockResolvedValue([]),
    createAlertRule: vi.fn().mockResolvedValue({ ruleId: "rule-1" }),
    ...overrides,
  };
}
