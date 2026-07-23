// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RcaReport } from "../api/evidence-schemas";
import { CandidateEvidenceTokens } from "../devpreview-surfaces";

describe("legacy metadata evidence navigation", () => {
  it("keeps an old object ref clickable after it gains a correlation-window key", () => {
    const objectRef =
      "object://evidence/correlation-1.json#metadata:current_workload_snapshots";
    const reference: RcaReport["supporting_evidence_refs"][number] = {
      source: "metadata",
      name: "current_workload_snapshots",
      check_id: null,
      summary: "workload snapshot",
      query: null,
      evidence_ref: objectRef,
      schema_version: 1,
      source_version: "metadata-v2",
      collector: "cluster-agent",
      collector_version: "2",
      query_version: "1",
      collected_at: "2026-07-24T00:01:00Z",
      evidence_key: "workspace:target:metadata:window-1",
      source_id: "metadata",
      agent_id: "agent-1",
      window_start: "2026-07-24T00:00:30Z",
    };
    const onEvidenceSelect = vi.fn();

    render(
      <CandidateEvidenceTokens
        label="확인된 근거"
        items={[objectRef]}
        tone="ok"
        references={[reference]}
        onEvidenceSelect={onEvidenceSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "metadata · current workload snapshots" }));

    expect(onEvidenceSelect).toHaveBeenCalledOnce();
    expect(onEvidenceSelect).toHaveBeenCalledWith(objectRef);
  });
});
