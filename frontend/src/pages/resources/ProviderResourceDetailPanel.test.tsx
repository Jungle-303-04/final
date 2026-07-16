// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import type { ProviderResourceDetail } from "../../features/resources/providerResourceContract";
import { ProviderResourceDetailPanel } from "./ProviderResourceDetailPanel";

afterEach(cleanup);

describe("ProviderResourceDetailPanel", () => {
  it("renders observed AWS fields and failed conditions without inventing missing values", () => {
    renderPanel({
      type: "aws-machine",
      instanceType: "m6i.large",
      instanceId: "i-123",
      instanceState: "stopped",
      providerId: null,
      iamInstanceProfile: null,
      sshKeyName: null,
      subnetId: "subnet-a",
      secretsBackend: null,
      addresses: [{ type: "InternalIP", address: "10.0.0.2" }],
      conditions: [{
        type: "Ready",
        status: "False",
        reason: "InstanceStopped",
        message: "The observed instance is stopped.",
        lastTransitionTime: null,
      }],
    });

    expect(screen.getByRole("heading", { name: "Provider details" })).toBeTruthy();
    expect(screen.getByText("m6i.large")).toBeTruthy();
    expect(screen.getByText("InternalIP: 10.0.0.2")).toBeTruthy();
    expect(screen.getByText("InstanceStopped")).toBeTruthy();
    expect(screen.queryByText("IAM profile")).toBeNull();
  });

  it("renders Azure machine-pool scaling, labels, and taints from the typed response", () => {
    renderPanel({
      type: "azure-managed-machine-pool",
      poolName: "system",
      vmSize: "Standard_D4s_v5",
      mode: "System",
      osType: "Linux",
      osDiskType: "Managed",
      osDiskSizeGb: 128,
      priority: "Regular",
      maxPods: 60,
      scaling: { minimum: 3, maximum: 12, current: 5 },
      scaleDownMode: "Delete",
      availabilityZones: ["1", "2"],
      labels: [{ key: "pool", value: "system" }],
      taints: [{ key: "CriticalAddonsOnly", value: null, effect: "NoSchedule" }],
      conditions: [],
    });

    expect(screen.getByText("Standard_D4s_v5")).toBeTruthy();
    expect(screen.getByText("pool=system")).toBeTruthy();
    expect(screen.getByText("CriticalAddonsOnly · NoSchedule")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
  });

  it("renders CAPI machine identity, node evidence, references, and bounded conditions", () => {
    renderPanel({
      type: "capi-machine",
      phase: "Running",
      role: "control-plane",
      clusterName: "prod",
      version: "v1.33.1",
      failureDomain: "ap-northeast-2a",
      provider: "AWS",
      providerId: "aws:///ap-northeast-2a/i-123",
      providerRegion: "ap-northeast-2a",
      providerInstanceId: "i-123",
      nodeName: "prod-control-plane-1",
      nodeUid: "node-uid",
      bootstrapRef: { apiVersion: "bootstrap.cluster.x-k8s.io/v1beta2", kind: "KubeadmConfig", namespace: "prod", name: "bootstrap-1" },
      infrastructureRef: { apiVersion: "infrastructure.cluster.x-k8s.io/v1beta2", kind: "AWSMachine", namespace: "prod", name: "machine-1" },
      addresses: [{ type: "InternalIP", address: "10.0.0.4" }],
      osImage: "Flatcar",
      architecture: "arm64",
      kernelVersion: "6.6",
      containerRuntimeVersion: "containerd://2.0",
      kubeletVersion: "v1.33.1",
      conditions: [{
        type: "Ready",
        status: "True",
        reason: "Ready",
        message: null,
        lastTransitionTime: "2026-07-16T00:00:00Z",
      }],
    });

    expect(screen.getByText("control-plane")).toBeTruthy();
    expect(screen.getByText("InternalIP: 10.0.0.4")).toBeTruthy();
    expect(screen.getByText("AWSMachine · prod · machine-1")).toBeTruthy();
    expect(screen.getByText("containerd://2.0")).toBeTruthy();
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
  });
});

function renderPanel(detail: ProviderResourceDetail) {
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <ProviderResourceDetailPanel detail={detail} />
    </I18nProvider>,
  );
}
