// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ResourceFacts } from "../../features/resources/resourcesContract";
import { I18nProvider } from "../../shared/i18n";
import { ResourceFactsPanel } from "./ResourceFactsPanel";

afterEach(cleanup);

type NodeFacts = Extract<ResourceFacts, { type: "node" }>;

const POD_FACTS = {
  type: "pod",
  phase: "Running",
  nodeName: null,
  owner: { kind: "Deployment", name: "checkout-api" },
  readiness: { ready: 1, total: 2 },
  restartCount: 1_234,
  cpuMillicores: 1_250,
  memoryMebibytes: 2_048,
  podIp: "10.42.0.17",
  hostIp: "10.0.0.8",
  waitingReasons: ["CrashLoopBackOff"],
  terminatedReasons: [],
} satisfies Extract<ResourceFacts, { type: "pod" }>;

describe("ResourceFactsPanel", () => {
  it("renders the Pod contract facts with localized numbers and omits unavailable fields", () => {
    renderFacts(POD_FACTS, "en-US");
    const facts = screen.getByRole("region", { name: "Observed facts" });

    expect(within(facts).getByText("Running")).toBeTruthy();
    expect(within(facts).getByText("Deployment/checkout-api")).toBeTruthy();
    expect(within(facts).getByText("1,234")).toBeTruthy();
    expect(within(facts).getByText("1,250 m")).toBeTruthy();
    expect(within(facts).getByText("2,048 MiB")).toBeTruthy();
    // 계약에 값이 있는 필드는 렌더된다
    expect(within(facts).getByText("1/2")).toBeTruthy();
    expect(within(facts).getByText("10.42.0.17")).toBeTruthy();
    expect(within(facts).getByText("10.0.0.8")).toBeTruthy();
    expect(within(facts).getByText("CrashLoopBackOff")).toBeTruthy();
    // nodeName null, terminated·containers 빈 값은 생략된다(가짜값 금지)
    expect(within(facts).queryByText("Node")).toBeNull();
    expect(within(facts).queryByText("Terminated")).toBeNull();
    expect(within(facts).queryByText("Containers")).toBeNull();
  });

  it("keeps Node readiness true, false, and unavailable as distinct states", () => {
    const view = renderFacts(nodeFacts(true), "en-US");

    expect(screen.getByRole("region", { name: "Observed facts" }).textContent).toContain("Yes");
    view.rerender(<FactsHarness facts={nodeFacts(false)} navigatorLanguage="en-US" />);
    expect(screen.getByRole("region", { name: "Observed facts" }).textContent).toContain("No");

    view.rerender(<FactsHarness facts={nodeFacts(null)} navigatorLanguage="en-US" />);
    expect(screen.queryByRole("region", { name: "Observed facts" })).toBeNull();
    expect(screen.queryByText("No")).toBeNull();
  });

  it("localizes product copy in Korean while preserving Kubernetes labels and raw values", () => {
    const serviceFacts = {
      type: "service",
      serviceType: "ClusterIP",
      clusterIp: "10.96.0.10",
      externalUrl: null,
      externalHosts: [],
      selector: [],
      ports: [],
    } satisfies Extract<ResourceFacts, { type: "service" }>;

    renderFacts(serviceFacts, "ko-KR");
    const facts = screen.getByRole("region", { name: "관측 요약" });

    expect(within(facts).getByText("Type")).toBeTruthy();
    expect(within(facts).getByText("Cluster IP")).toBeTruthy();
    expect(within(facts).getByText("ClusterIP")).toBeTruthy();
    expect(within(facts).getByText("10.96.0.10")).toBeTruthy();
    expect(within(facts).queryByText("External URL")).toBeNull();
  });
});

function nodeFacts(ready: boolean | null): NodeFacts {
  return {
    type: "node",
    ready,
    podCapacity: null,
    cpuMillicores: null,
    memoryMebibytes: null,
    cpuRatio: null,
    memoryRatio: null,
  };
}

function renderFacts(facts: ResourceFacts, navigatorLanguage: string) {
  return render(<FactsHarness facts={facts} navigatorLanguage={navigatorLanguage} />);
}

function FactsHarness({
  facts,
  navigatorLanguage,
}: {
  facts: ResourceFacts;
  navigatorLanguage: string;
}) {
  return (
    <I18nProvider navigatorLanguage={navigatorLanguage} storage={null}>
      <ResourceFactsPanel facts={facts} />
    </I18nProvider>
  );
}
