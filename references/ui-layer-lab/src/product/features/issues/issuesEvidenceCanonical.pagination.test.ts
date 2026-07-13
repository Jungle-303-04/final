import { describe, expect, it } from "vitest";

import { IssuesCanonicalError } from "./issuesContract";
import {
  toIssueEvidencePage,
  toIssueRcaReportPage,
} from "./issuesEvidenceCanonical";

const PAGE_METADATA = {
  items: [],
  limit: 50,
  offset: 0,
};

describe("Issues Evidence pagination canonical mapping", () => {
  it("preserves every nonblank next cursor byte", () => {
    const nextCursor = "  opaque/+==  ";

    expect(toIssueEvidencePage("correlation-1", {
      ...PAGE_METADATA,
      has_more: true,
      next_cursor: nextCursor,
    }).nextCursor).toBe(nextCursor);
    expect(toIssueRcaReportPage("correlation-1", {
      ...PAGE_METADATA,
      has_more: true,
      next_cursor: nextCursor,
    }).nextCursor).toBe(nextCursor);
  });

  it.each([true, false])(
    "rejects a blank next cursor when has_more is %s",
    (hasMore) => {
      expect(() => toIssueEvidencePage("correlation-1", {
        ...PAGE_METADATA,
        has_more: hasMore,
        next_cursor: "  ",
      })).toThrow(IssuesCanonicalError);
      expect(() => toIssueRcaReportPage("correlation-1", {
        ...PAGE_METADATA,
        has_more: hasMore,
        next_cursor: "",
      })).toThrow(IssuesCanonicalError);
    },
  );

  it("uses null as the only absent cursor representation", () => {
    expect(toIssueEvidencePage("correlation-1", {
      ...PAGE_METADATA,
      has_more: false,
      next_cursor: null,
    }).nextCursor).toBeNull();
    expect(toIssueRcaReportPage("correlation-1", {
      ...PAGE_METADATA,
      has_more: false,
      next_cursor: null,
    }).nextCursor).toBeNull();
    expect(() => toIssueEvidencePage("correlation-1", {
      ...PAGE_METADATA,
      has_more: true,
      next_cursor: null,
    })).toThrow(IssuesCanonicalError);
  });
});
