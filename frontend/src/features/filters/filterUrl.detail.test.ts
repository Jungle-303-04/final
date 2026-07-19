import { describe, expect, it } from "vitest";

import {
  canonicalizeProductFilterUrl,
  detailHistoryMode,
  filterHistoryMode,
  parseProductFilterUrl,
  serializeProductFilterUrl,
} from "./filterUrl";

describe("VP-010 detail URL policy", () => {
  it("round-trips an application instance only with its application detail", () => {
    const parsed = parseProductFilterUrl(
      "?clusters=cluster-a&app=app-checkout&instance=binding-prod&tab=overview",
    );

    expect(parsed.detail).toMatchObject({
      application: "app-checkout",
      applicationInstance: "binding-prod",
      tab: "overview",
    });
    expect(serializeProductFilterUrl(parsed.state, parsed.detail)).toBe(
      "?clusters=cluster-a&app=app-checkout&instance=binding-prod&tab=overview",
    );
    expect(canonicalizeProductFilterUrl("?detail=change-42&instance=binding-prod"))
      .toBe("?detail=change-42");
  });

  it("round-trips a canonical merged-surface section and uses push history", () => {
    const parsed = parseProductFilterUrl("?section=repositories");

    expect(parsed.detail.surfaceTab).toBe("repositories");
    expect(serializeProductFilterUrl(parsed.state, parsed.detail))
      .toBe("?section=repositories");
    expect(detailHistoryMode("surface-tab")).toBe("push");
    expect(canonicalizeProductFilterUrl("?section=removed")).toBe("");
  });

  it("preserves a workflow run link through merged deploy URL canonicalization", () => {
    const query = "?detail=run-77&section=workflows&view=runs";
    const parsed = parseProductFilterUrl(query);

    expect(parsed.detail).toMatchObject({
      detail: "run-77",
      surfaceTab: "workflows",
      workflowView: "runs",
    });
    expect(serializeProductFilterUrl(parsed.state, parsed.detail)).toBe(
      "?detail=run-77&view=runs&section=workflows",
    );
  });

  it("round-trips an opaque workload only with its application detail", () => {
    const parsed = parseProductFilterUrl(
      "?app=app-checkout&instance=binding-prod&workload=inventory-key&tab=topology",
    );

    expect(parsed.detail).toMatchObject({
      application: "app-checkout",
      applicationInstance: "binding-prod",
      applicationWorkload: "inventory-key",
      tab: "topology",
    });
    expect(serializeProductFilterUrl(parsed.state, parsed.detail)).toBe(
      "?app=app-checkout&instance=binding-prod&workload=inventory-key&tab=topology",
    );
    expect(canonicalizeProductFilterUrl("?detail=change-42&workload=inventory-key"))
      .toBe("?detail=change-42");
  });

  it("uses push for explicit filter changes and replace for typing or migration", () => {
    expect(filterHistoryMode("chip-add")).toBe("push");
    expect(filterHistoryMode("chip-remove")).toBe("push");
    expect(filterHistoryMode("clear-labels")).toBe("push");
    expect(filterHistoryMode("clear-filters")).toBe("push");
    expect(filterHistoryMode("view-change")).toBe("push");
    expect(filterHistoryMode("typing")).toBe("replace");
    expect(filterHistoryMode("canonicalize")).toBe("replace");
    expect(filterHistoryMode("legacy-migration")).toBe("replace");
  });

  it("uses explicit history policies for detail navigation", () => {
    expect(detailHistoryMode("detail-open")).toBe("push");
    expect(detailHistoryMode("drill-in")).toBe("push");
    expect(detailHistoryMode("detail-instance")).toBe("push");
    expect(detailHistoryMode("detail-workload")).toBe("push");
    expect(detailHistoryMode("detail-close")).toBe("replace");
    expect(detailHistoryMode("detail-tab")).toBe("replace");
    expect(detailHistoryMode("detail-expand")).toBe("replace");
    expect(detailHistoryMode("detail-instance-default")).toBe("replace");
    expect(detailHistoryMode("detail-workload-default")).toBe("replace");
    expect(detailHistoryMode("detail-workload-recovery")).toBe("replace");
    expect(detailHistoryMode("resource-surface-view")).toBe("push");
    expect(detailHistoryMode("traffic-filter")).toBe("push");
    expect(detailHistoryMode("traffic-sort")).toBe("push");
    expect(detailHistoryMode("traffic-flow")).toBe("push");
    expect(detailHistoryMode("traffic-page")).toBe("push");
  });
});
