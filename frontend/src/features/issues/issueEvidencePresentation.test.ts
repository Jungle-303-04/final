import { describe, expect, it } from "vitest";
import {
  evidenceCollectorLabel,
  evidenceKindToken,
  evidenceRecordSources,
  evidenceRecordSubject,
  evidenceSourceKind,
  evidenceSummaryFacts,
} from "./issueEvidencePresentation";

describe("issueEvidencePresentation", () => {
  it("extracts only observed Kubernetes counts", () => {
    expect(evidenceSummaryFacts("pods=59, nodes=3, events=200")).toEqual([
      { kind: "pods", count: 59 },
      { kind: "nodes", count: 3 },
      { kind: "events", count: 200 },
    ]);
  });

  it("condenses a long query list to its actual count", () => {
    expect(evidenceSummaryFacts(
      "entries=5, queries=color_turf_runtime_failures,node_collector_runtime_saturation",
    )).toEqual([
      { kind: "entries", count: 5 },
      { kind: "queries", count: 2 },
    ]);
  });

  it("recognizes source and bundle vocabulary without inventing unknown values", () => {
    expect(evidenceSourceKind("kubernetes")).toBe("kubernetes");
    expect(evidenceSourceKind("custom-source")).toBe("unknown");
    expect(evidenceKindToken("rca_bundle")).toBe("rca_bundle");
    expect(evidenceKindToken("custom")).toBe("unknown");
  });

  it("extracts record subject and known sources", () => {
    const summary = "cluster-2-5086: kubernetes, metrics, logs, traces";
    expect(evidenceRecordSubject(summary)).toBe("cluster-2-5086");
    expect(evidenceRecordSources(summary)).toEqual(["kubernetes", "metrics", "logs", "traces"]);
  });

  it("removes an unknown collector version from the visible label", () => {
    expect(evidenceCollectorLabel("cluster-agent@unknown")).toBe("cluster-agent");
  });
});
