import { describe, expect, it, vi } from "vitest";
import {
  createIssuesAdapter,
  type IssuesEndpointDependencies,
} from "./createIssuesAdapter";
import type { IssuesPortFailure } from "./issuesContract";

describe("createIssuesAdapter opaque cursor boundary", () => {
  it("preserves every nonblank cursor byte for Evidence and RCA report pages", async () => {
    const dependencies = endpoints();
    const port = createIssuesAdapter(dependencies);

    await expect(port.loadEvidence("correlation-1", {
      cursor: "  cursor/+==  ",
      limit: 50,
    })).resolves.toMatchObject({ nextCursor: "  evidence-next/+==  " });
    await expect(port.loadReports("correlation-1", {
      cursor: "  report/+==  ",
    })).resolves.toMatchObject({ nextCursor: "  report-next/+==  " });

    expect(dependencies.listEvidence).toHaveBeenCalledWith(expect.objectContaining({
      cursor: "  cursor/+==  ",
    }));
    expect(dependencies.listRcaReports).toHaveBeenCalledWith(expect.objectContaining({
      cursor: "  report/+==  ",
    }));
  });

  it("rejects an explicitly blank cursor instead of treating it as absent", async () => {
    const dependencies = endpoints();
    const port = createIssuesAdapter(dependencies);

    await expect(port.loadEvidence("correlation-1", { cursor: "  " })).rejects.toMatchObject({
      code: "invalid-request",
    } satisfies Partial<IssuesPortFailure>);
    await expect(port.loadReports("correlation-1", { cursor: "" })).rejects.toMatchObject({
      code: "invalid-request",
    } satisfies Partial<IssuesPortFailure>);
    expect(dependencies.listEvidence).not.toHaveBeenCalled();
    expect(dependencies.listRcaReports).not.toHaveBeenCalled();
  });
});

function endpoints(): IssuesEndpointDependencies {
  return {
    listRcaTimeline: vi.fn(),
    getRcaIncident: vi.fn(),
    listEvidence: vi.fn().mockResolvedValue({
      items: [],
      limit: 50,
      offset: 0,
      has_more: true,
      next_cursor: "  evidence-next/+==  ",
    }),
    listRcaReports: vi.fn().mockResolvedValue({
      items: [],
      limit: 50,
      offset: 0,
      has_more: false,
      next_cursor: "  report-next/+==  ",
    }),
    getAuditTimeline: vi.fn(),
    getIncidentRecentChanges: vi.fn(),
    getRecoveryPlanByCorrelation: vi.fn(),
    selectRecoveryAction: vi.fn(),
  };
}
