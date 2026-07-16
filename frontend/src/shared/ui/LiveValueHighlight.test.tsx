// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LiveValueHighlight } from "./LiveValueHighlight";

afterEach(cleanup);

describe("LiveValueHighlight", () => {
  it("highlights only after the value changes and does not restart for the same value", async () => {
    const view = render(
      <LiveValueHighlight tone="info" value={42}>42%</LiveValueHighlight>,
    );
    const initial = view.container.firstElementChild;
    expect(initial?.classList.contains("motion-value-static")).toBe(true);

    view.rerender(
      <LiveValueHighlight tone="info" value={57}>57%</LiveValueHighlight>,
    );
    await waitFor(() => expect(
      view.container.firstElementChild?.classList.contains("motion-value-change"),
    ).toBe(true));
    const changed = view.container.firstElementChild;
    expect(changed).not.toBe(initial);

    view.rerender(
      <LiveValueHighlight tone="info" value={57}>57%</LiveValueHighlight>,
    );
    expect(view.container.firstElementChild).toBe(changed);
  });
});
