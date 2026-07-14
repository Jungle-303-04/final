// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { WorkflowViewSettings } from "./WorkflowViewSettings";

let graphViewport: ReturnType<typeof createMediaQuery>;

beforeEach(() => {
  graphViewport = createMediaQuery(true);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => graphViewport),
  });
});

afterEach(cleanup);

describe("WorkflowViewSettings", () => {
  it("closes the portal when the graph becomes hidden", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <WorkflowViewSettings
          compact={false}
          direction="LR"
          setCompact={vi.fn()}
          setDirection={vi.fn()}
          setShowCheckpoints={vi.fn()}
          setShowMetadata={vi.fn()}
          showCheckpoints
          showMetadata
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "View settings" }));
    expect(await screen.findByRole("dialog", { name: "View settings" })).toBeTruthy();

    act(() => graphViewport.setMatches(false));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "View settings" })).toBeNull());
  });
});

function createMediaQuery(initial: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  return {
    matches: initial,
    media: "(min-width: 1280px)",
    onchange: null,
    addEventListener: vi.fn((_type: "change", listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: "change", listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    setMatches(next: boolean) {
      this.matches = next;
      const event = { matches: next, media: this.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}
