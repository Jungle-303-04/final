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
afterEach(() => cleanup());

describe("ProductShell AI panel", () => {
  it("opens from the right at fixed inner width without moving its floating trigger", async () => {
    const user = userEvent.setup();
    const port = assistantPort({
      loadSuggestions: vi.fn().mockResolvedValue([
        { id: "why", label: "왜 재시작하나요?", prompt: "왜 재시작하나요?" },
      ]),
    });
    renderShell({ aiAssistantPort: port });
    const trigger = screen.getByRole("button", { name: "Opsia AI 열기" });
    expect(trigger.className).toContain("fixed");
    expect(trigger.className).toContain("right-6");
    expect(trigger.className).toContain("bottom-6");

    await user.click(trigger);
    const panel = screen.getByRole("complementary", { name: "Opsia AI" });
    const inner = panel.querySelector('[data-slot="ai-assistant-inner"]');
    expect(panel.getAttribute("data-side")).toBe("right");
    expect(panel.getAttribute("data-open")).toBe("true");
    expect(panel.getAttribute("data-width")).toBe("420");
    expect(inner?.getAttribute("data-inner-width")).toBe("420");
    expect(panel.previousElementSibling?.id).toBe("product-main");
    expect(screen.getAllByRole("button", { name: "Opsia AI 닫기" })).toContain(trigger);
    expect(await screen.findByRole("button", { name: "왜 재시작하나요?" })).toBeTruthy();
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

  it("keeps an open detail and rail in one flex transition on wide screens", async () => {
    const user = userEvent.setup();
    renderShell({
      aiAssistantPort: assistantPort(),
      initialEntry: "/resources?clusters=cluster-1&resources.types=pod" +
        "&detail=Pod%2Fshop%2Fcheckout-api-0",
      releasedSurfaceIds: new Set(["home", "resources"]),
    });
    const sidebar = screen.getByRole("complementary", { name: "제품 메뉴" });
    await waitFor(() => expect(sidebar.getAttribute("data-state")).toBe("collapsed"));

    await user.click(screen.getByRole("button", { name: "Opsia AI 열기" }));
    const panel = screen.getByRole("complementary", { name: "Opsia AI" });
    expect(panel.previousElementSibling?.id).toBe("product-main");
    expect(sidebar.getAttribute("data-state")).toBe("collapsed");
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
    expect(container.querySelector('[data-slot="unified-filter-bar"]')).toBeNull();

    await user.click(screen.getByRole("button", { name: "Opsia AI 열기" }));
    await waitFor(() => expect(container.querySelector('[data-slot="unified-filter-bar"]')).toBeTruthy());
    expect(await screen.findByText(
      "Opsia AI 공간을 확보하기 위해 리소스 상세를 닫았습니다.",
    )).toBeTruthy();
  });
});

function assistantPort(overrides: Partial<AiAssistantPort> = {}): AiAssistantPort {
  return {
    ask: vi.fn().mockResolvedValue({ answer: "no data", evidence: [] }),
    loadSuggestions: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}
