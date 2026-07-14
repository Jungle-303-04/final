// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FirstAppearanceMotionBoundary,
  useFirstAppearanceMotion,
} from "../useFirstAppearanceMotion";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("first appearance motion", () => {
  it("animates a stable identity once even when its element remounts", () => {
    const view = render(<Scene visible />);

    expect(screen.getByTestId("resource").dataset.entering).toBe("true");
    view.rerender(<Scene visible={false} />);
    view.rerender(<Scene visible />);

    expect(screen.getByTestId("resource").dataset.entering).toBe("false");
  });

  it("starts a fresh first appearance set when the scene scope changes", () => {
    const view = render(<Scene scope="cluster-a" visible />);

    expect(screen.getByTestId("resource").dataset.entering).toBe("true");
    view.rerender(<Scene scope="cluster-b" visible />);

    expect(screen.getByTestId("resource").dataset.entering).toBe("true");
  });

  it("skips entrance motion when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    render(<Scene visible />);

    expect(screen.getByTestId("resource").dataset.entering).toBe("false");
  });
});

function Scene({
  scope = "cluster-a",
  visible,
}: {
  scope?: string;
  visible: boolean;
}) {
  return (
    <FirstAppearanceMotionBoundary scope={scope}>
      {visible ? <Probe identity="pod:default/api-0" /> : null}
    </FirstAppearanceMotionBoundary>
  );
}

function Probe({ identity }: { identity: string }) {
  const entering = useFirstAppearanceMotion(identity);
  return <div data-entering={String(entering)} data-testid="resource" />;
}
