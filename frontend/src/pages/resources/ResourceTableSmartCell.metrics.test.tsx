// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ResourceSummary } from "../../features/resources/resourcesContract";
import { I18nProvider } from "../../shared/i18n";
import { POD_LIST } from "./ResourcesPage.testFixtures";
import { ResourceTableSmartCell } from "./ResourceTableSmartCell";

afterEach(cleanup);

describe("ResourceTableSmartCell server metrics", () => {
  it("shows Pod usage with request and limit evidence from the same snapshot", () => {
    const item = {
      ...POD_LIST.items[0],
      facts: {
        type: "pod",
        phase: "Running",
        nodeName: "worker-a",
        owner: null,
        readiness: { ready: 1, total: 1 },
        restartCount: 0,
        cpuMillicores: 250,
        memoryMebibytes: 192,
        podIp: null,
        hostIp: null,
        waitingReasons: [],
        terminatedReasons: [],
      },
      tableMetrics: {
        kind: "pod",
        resourceUid: POD_LIST.items[0]?.uid,
        sourceSnapshotId: "snapshot-42",
        observedAt: "2026-07-17T01:00:00.000Z",
        measurementWindow: "30s",
        cpuMillicores: 250,
        memoryMebibytes: 192,
        cpuRequestMillicores: 150,
        cpuLimitMillicores: 600,
        memoryRequestMebibytes: 192,
        memoryLimitMebibytes: 384,
        completeness: "exact",
        reasonCodes: [],
      },
    } as ResourceSummary;

    renderCell(item, "cpu");

    expect(screen.getByText("250 / 600 mCPU")).toBeTruthy();
    expect(screen.getByTitle("CPU · Requested 150 mCPU · Limits 600 mCPU")).toBeTruthy();
  });

  it("shows Node usage, allocatable capacity, and scheduled Pod count", () => {
    const base = POD_LIST.items[0]!;
    const item = {
      ...base,
      resourceType: "node",
      kind: "Node",
      namespace: null,
      facts: {
        type: "node",
        ready: true,
        podCapacity: 58,
        cpuMillicores: 1200,
        memoryMebibytes: 4096,
        cpuRatio: null,
        memoryRatio: null,
      },
      tableMetrics: {
        kind: "node",
        resourceUid: base.uid,
        sourceSnapshotId: "snapshot-42",
        observedAt: "2026-07-17T01:00:00.000Z",
        measurementWindow: "30s",
        cpuMillicores: 1200,
        memoryMebibytes: 4096,
        cpuAllocatableMillicores: 3900,
        memoryAllocatableMebibytes: 8192,
        podCount: 23,
        podAllocatable: 58,
        completeness: "exact",
        reasonCodes: [],
      },
    } as ResourceSummary;

    const view = renderCell(item, "cpu");
    expect(screen.getByText("1,200 / 3,900 mCPU")).toBeTruthy();

    view.rerender(harness(item, "capacity"));
    expect(screen.getByText("23/58")).toBeTruthy();
  });
});

function renderCell(item: ResourceSummary, column: "cpu" | "capacity") {
  return render(harness(item, column));
}

function harness(item: ResourceSummary, column: "cpu" | "capacity") {
  return (
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <ResourceTableSmartCell column={column} item={item} />
    </I18nProvider>
  );
}
