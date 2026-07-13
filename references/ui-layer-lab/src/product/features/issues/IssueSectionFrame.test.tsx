// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IssuesPortFailure } from "./issuesContract";
import { IssueSectionFrame } from "./IssueSectionFrame";
import { COPY } from "./IssuesSurface.testSupport";

afterEach(cleanup);

describe("IssueSectionFrame", () => {
  it("keeps the initial loading skeleton distinct from empty content", () => {
    const children = vi.fn();

    render(
      <IssueSectionFrame
        copy={COPY}
        state={{ data: null, failure: null, loading: true }}
        unavailable="Evidence unavailable"
      >
        {children}
      </IssueSectionFrame>,
    );

    expect(screen.getByRole("status").textContent).toContain(COPY.sectionLoading);
    expect(screen.queryByText(COPY.sectionEmpty)).toBeNull();
    expect(children).not.toHaveBeenCalled();
  });

  it("maps an initial failure without invoking the data renderer", () => {
    const children = vi.fn();

    render(
      <IssueSectionFrame
        copy={COPY}
        state={{
          data: null,
          failure: new IssuesPortFailure("forbidden"),
          loading: false,
        }}
        unavailable="Evidence unavailable"
      >
        {children}
      </IssueSectionFrame>,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Evidence unavailable");
    expect(alert.textContent).toContain(COPY.failureDetail("forbidden"));
    expect(children).not.toHaveBeenCalled();
  });

  it("renders the shared empty state only after an idle null result", () => {
    const children = vi.fn();

    render(
      <IssueSectionFrame
        copy={COPY}
        state={{ data: null, failure: null, loading: false }}
        unavailable="Evidence unavailable"
      >
        {children}
      </IssueSectionFrame>,
    );

    expect(screen.getByText(COPY.sectionEmpty)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(children).not.toHaveBeenCalled();
  });

  it("preserves the last successful data beside a background failure", () => {
    const children = vi.fn((value: { summary: string }) => (
      <p>{value.summary}</p>
    ));
    const data = { summary: "Verified evidence remains visible" };

    render(
      <IssueSectionFrame
        copy={COPY}
        state={{
          data,
          failure: new IssuesPortFailure("unavailable"),
          loading: true,
        }}
        unavailable="Evidence unavailable"
      >
        {children}
      </IssueSectionFrame>,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Evidence unavailable");
    expect(alert.textContent).toContain(COPY.failureDetail("unavailable"));
    expect(screen.getByText(data.summary)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(children).toHaveBeenCalledOnce();
    expect(children).toHaveBeenCalledWith(data);
  });
});
