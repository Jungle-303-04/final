// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RefreshAction,
  refreshFeedbackState,
  type RefreshFeedbackState,
  type RefreshStatusCopy,
} from "./RefreshFeedback";

const statusCopy: RefreshStatusCopy = {
  cancelled: "Refresh was cancelled.",
  failed: "Refresh failed safely.",
  pending: "Refreshing data.",
  reconnecting: "Reconnecting data.",
  succeeded: "Data refreshed.",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RefreshFeedback", () => {
  it("keeps the renderer decorative while its owner retains refresh semantics", () => {
    render(
      <RefreshAction
        iconOnly
        label="Refresh applications"
        onRefresh={vi.fn()}
        renderFeedback={renderFeedback}
        statusCopy={statusCopy}
      />,
    );

    const action = screen.getByRole("button", { name: "Refresh applications" });
    const visual = action.querySelector<HTMLElement>('[data-slot="test-refresh-feedback"]');

    expect(visual?.getAttribute("aria-hidden")).toBe("true");
    expect(visual?.dataset.state).toBe("idle");

    fireEvent.click(action);

    expect(action.getAttribute("aria-busy")).toBe("true");
    expect(visual?.dataset.state).toBe("pending");
    expect(screen.getByRole("status").textContent).toBe(statusCopy.pending);
  });

  it("announces success only after a refresh data frame completes", () => {
    const view = render(
      <RefreshAction
        iconOnly
        isRefreshing={false}
        label="Refresh applications"
        onRefresh={vi.fn()}
        renderFeedback={renderFeedback}
        statusCopy={statusCopy}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh applications" }));
    expect(screen.getByRole("status").textContent).toBe(statusCopy.pending);

    view.rerender(
      <RefreshAction
        iconOnly
        isRefreshing
        label="Refresh applications"
        onRefresh={vi.fn()}
        renderFeedback={renderFeedback}
        statusCopy={statusCopy}
      />,
    );
    view.rerender(
      <RefreshAction
        iconOnly
        isRefreshing={false}
        label="Refresh applications"
        onRefresh={vi.fn()}
        renderFeedback={renderFeedback}
        statusCopy={statusCopy}
      />,
    );

    expect(screen.getByRole("status").textContent).toBe(statusCopy.succeeded);
    expect(document.querySelector<HTMLElement>('[data-slot="test-refresh-feedback"]')?.dataset.state).toBe("succeeded");
  });

  it("uses caller-owned safe copy for failure and reconnecting states", () => {
    const { rerender } = render(
      <RefreshAction
        hasFailed
        iconOnly
        label="Refresh applications"
        onRefresh={vi.fn()}
        renderFeedback={renderFeedback}
        statusCopy={statusCopy}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe(statusCopy.failed);

    rerender(
      <RefreshAction
        iconOnly
        isReconnecting
        label="Refresh applications"
        onRefresh={vi.fn()}
        renderFeedback={renderFeedback}
        statusCopy={statusCopy}
      />,
    );

    expect(screen.getByRole("status").textContent).toBe(statusCopy.reconnecting);
  });

  it("maps only supplied data-frame outcomes to a visual state", () => {
    expect(refreshFeedbackState({ phase: "idle" })).toBe("idle");
    expect(refreshFeedbackState({ phase: "pending" })).toBe("pending");
    expect(refreshFeedbackState({ phase: "succeeded" })).toBe("succeeded");
    expect(refreshFeedbackState({ hasFailed: true, phase: "idle" })).toBe("failed");
    expect(refreshFeedbackState({ isReconnecting: true, phase: "idle" })).toBe("reconnecting");
  });
});

function renderFeedback(state: RefreshFeedbackState) {
  return <span aria-hidden="true" data-slot="test-refresh-feedback" data-state={state} />;
}
