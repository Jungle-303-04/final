// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { RightsizingStrip } from "./RightsizingStrip";
import type { RightsizingObservedWorkload } from "./rightsizingContract";

afterEach(cleanup);

describe("RightsizingStrip", () => {
  it("keeps collector absence distinct from an observed no-change result", () => {
    renderStrip({
      availability: "unavailable",
      reasonCodes: ["rightsizing_observation_not_integrated"],
    });

    expect(screen.getByTestId("rightsizing-unavailable")).toBeTruthy();
    expect(screen.queryByText("rightsizing_observation_not_integrated")).toBeNull();
    expect(screen.getByText(/not a savings estimate or an automatic change/i)).toBeTruthy();
  });

  it("renders server recommendations, safety signals, and provenance without recalculation", () => {
    renderStrip(observed());

    expect(screen.getByTestId("rightsizing-observed")).toBeTruthy();
    expect(screen.getByText("500 mCPU")).toBeTruthy();
    expect(screen.getByText("Manual review")).toBeTruthy();
    expect(screen.getByText("Bursty demand")).toBeTruthy();
    expect(screen.getByText(/metrics-repository/)).toBeTruthy();
  });
});

function renderStrip(evidence: Parameters<typeof RightsizingStrip>[0]["evidence"]) {
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <RightsizingStrip evidence={evidence} />
    </I18nProvider>,
  );
}

function observed(): RightsizingObservedWorkload {
  return {
    availability: "partial",
    resource: {
      apiGroup: "apps",
      version: "v1",
      kind: "Deployment",
      namespace: "shop",
      name: "checkout",
      uid: "deployment-uid",
    },
    observedAt: "2026-07-16T09:00:00Z",
    freshness: "live",
    provenance: {
      collector: "metrics-repository",
      algorithmRevision: "2026-07",
      sourceRevision: "metrics-cut-17",
      windowStartedAt: "2026-07-09T09:00:00Z",
      windowEndedAt: "2026-07-16T09:00:00Z",
      sampleIntervalSeconds: 300,
    },
    replicas: 2,
    scaledToZero: false,
    classification: "review",
    impact: { replicas: 2, cpuMillicoresChange: 0, memoryBytesChange: 0 },
    rows: [{
      container: "server",
      resource: "cpu",
      fit: "oversized",
      action: "review",
      confidence: "medium",
      currentRequest: { unit: "millicores", value: 500 },
      observedDemand: { unit: "millicores", value: 180 },
      recommendedRequest: null,
      sampleCount: 1_900,
      expectedSamples: 2_016,
      coverageBasisPoints: 9_424,
      signals: ["bursty"],
      reasonCodes: ["bursty_cpu_review"],
    }],
    reasonCodes: ["partial_container_evidence"],
  };
}
