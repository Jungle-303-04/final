// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ isDesktop: false }));
const lazySheet = vi.hoisted(() => vi.fn(() => <div>Native terminal sheet</div>));

vi.mock("./desktopBridge", () => ({ desktopBridge: bridge }));
vi.mock("./DesktopLocalTerminalSheet", () => ({ DesktopLocalTerminalSheet: lazySheet }));

import { DesktopLocalTerminalEntry } from "./DesktopLocalTerminalEntry";

afterEach(() => {
  bridge.isDesktop = false;
  lazySheet.mockClear();
});

describe("DesktopLocalTerminalEntry", () => {
  it("does not render or request the native terminal surface in a browser runtime", async () => {
    render(<DesktopLocalTerminalEntry />);

    await Promise.resolve();
    expect(screen.queryByText("Native terminal sheet")).toBeNull();
    expect(lazySheet).not.toHaveBeenCalled();
  });

  it("loads the terminal surface only after the desktop runtime proves it is native", async () => {
    bridge.isDesktop = true;
    render(<DesktopLocalTerminalEntry />);

    expect(await screen.findByText("Native terminal sheet")).toBeTruthy();
    expect(lazySheet).toHaveBeenCalledTimes(1);
  });
});
