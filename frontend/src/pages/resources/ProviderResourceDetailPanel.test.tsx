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
});

function renderPanel(detail: ProviderResourceDetail) {
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <ProviderResourceDetailPanel detail={detail} />
    </I18nProvider>,
  );
}
