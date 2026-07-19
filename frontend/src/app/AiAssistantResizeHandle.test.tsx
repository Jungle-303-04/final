// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../shared/i18n";
import { AiAssistantResizeHandle } from "./AiAssistantResizeHandle";

let frame: FrameRequestCallback | null = null;

beforeEach(() => {
  frame = null;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    frame = callback;
    return 7;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AiAssistantResizeHandle", () => {
  it("previews pointer resizing through one animation frame and commits only on pointerup", () => {
    const onWidthCommit = vi.fn();
    const { container } = renderHandle(onWidthCommit);
    const panel = container.querySelector<HTMLElement>("[data-slot='ai-assistant-panel']");
    const handle = screen.getByRole("separator", { name: "AI 패널 너비 조절" });
    expect(panel).not.toBeNull();

    fireEvent.pointerDown(handle, { clientX: 700, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 669, pointerId: 1 });

    expect(onWidthCommit).not.toHaveBeenCalled();
    expect(panel?.dataset.resizing).toBe("true");
    expect(panel?.style.getPropertyValue("--ai-width")).toBe("");

    frame?.(16);
    expect(panel?.style.getPropertyValue("--ai-width")).toBe("581px");

    fireEvent.pointerUp(document, { clientX: 669, pointerId: 1 });
    expect(onWidthCommit).toHaveBeenCalledWith(575);
    expect(panel?.dataset.width).toBe("575");
    expect(panel?.dataset.resizing).toBe("true");

    frame?.(32);
    expect(panel?.dataset.resizing).toBeUndefined();
    expect(panel?.style.getPropertyValue("--ai-width")).toBe("");
  });

  it("retains keyboard resizing and separator ARIA semantics", () => {
    const onWidthCommit = vi.fn();
    renderHandle(onWidthCommit);
    const handle = screen.getByRole("separator", { name: "AI 패널 너비 조절" });

    expect(handle.getAttribute("aria-valuemin")).toBe("475");
    expect(handle.getAttribute("aria-valuemax")).toBe("700");
    expect(handle.getAttribute("aria-valuenow")).toBe("550");

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(onWidthCommit).toHaveBeenCalledWith(575);
  });
});

function renderHandle(onWidthCommit: (width: number) => void) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <AiResizeFixture onWidthCommit={onWidthCommit} />
    </I18nProvider>,
  );
}

function AiResizeFixture({ onWidthCommit }: { onWidthCommit: (width: number) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  return (
    <div className="motion-ai-panel" data-slot="ai-assistant-panel" data-width="550" ref={hostRef}>
      <AiAssistantResizeHandle hostRef={hostRef} onWidthCommit={onWidthCommit} width={550} />
    </div>
  );
}
