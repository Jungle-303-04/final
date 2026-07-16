// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

    expect(screen.getByRole("heading", { name: "Resource details" })).toBeTruthy();
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

  it("renders certificate and certificate-request evidence from typed fields", () => {
    const { rerender } = renderPanel({
      type: "certificate",
      ready: true,
      secretName: "api-tls",
      revision: 3,
      isCa: false,
      duration: "2160h",
      renewBefore: "360h",
      notBefore: "2026-07-16T00:00:00Z",
      notAfter: "2026-10-14T00:00:00Z",
      renewalTime: "2026-09-29T00:00:00Z",
      failedIssuanceAttempts: null,
      lastFailureTime: null,
      privateKey: { algorithm: "ECDSA", size: 256, encoding: "PKCS1", rotationPolicy: "Always" },
      dnsNames: ["api.example.test"],
      issuerRef: { apiVersion: "cert-manager.io", kind: "ClusterIssuer", namespace: null, name: "prod" },
      usages: ["server auth"],
      conditions: [],
    });

    expect(screen.getByText("api-tls")).toBeTruthy();
    expect(screen.getByText("api.example.test")).toBeTruthy();
    expect(screen.getByText("ClusterIssuer · prod")).toBeTruthy();

    rerender(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ProviderResourceDetailPanel detail={{
          type: "certificate-request",
          ready: false,
          approved: true,
          denied: false,
          issuerRef: { apiVersion: "cert-manager.io", kind: "Issuer", namespace: "shop", name: "prod" },
          ownerCertificate: { apiVersion: "cert-manager.io/v1", kind: "Certificate", namespace: null, name: "api" },
          duration: "2160h",
          usages: ["server auth"],
          certificateIssued: false,
          conditions: [],
        }} />
      </I18nProvider>,
    );
    expect(screen.getByText("Certificate · api")).toBeTruthy();
    expect(screen.getByText("Issuer · shop · prod")).toBeTruthy();
  });

  it("filters and expands compliance controls without losing server order", () => {
    renderPanel({
      type: "cluster-compliance-report",
      frameworkId: "cis",
      frameworkTitle: "CIS Kubernetes",
      frameworkDescription: "Cluster baseline",
      frameworkVersion: "1.8",
      platform: "k8s",
      updatedAt: "2026-07-16T00:00:00Z",
      passCount: 4,
      failCount: 1,
      controls: [
        { id: "1.1", name: "API server", description: "Protect API server", severity: "HIGH", totalPass: 4, totalFail: 1, checkIds: ["AVD-1"] },
        { id: "1.2", name: "Scheduler", description: "Protect scheduler", severity: "LOW", totalPass: 2, totalFail: 0, checkIds: [] },
      ],
      conditions: [],
    });

    const search = screen.getByRole("searchbox", { name: "Search compliance controls" });
    fireEvent.change(search, { target: { value: "scheduler" } });
    expect(screen.getByText("Scheduler")).toBeTruthy();
    expect(screen.queryByText("API server")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Failed only" }));
    expect(screen.getByText("API server")).toBeTruthy();
    expect(screen.queryByText("Scheduler")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /API server/ }));
    expect(screen.getByText("Protect API server")).toBeTruthy();
    expect(screen.getByText("AVD-1")).toBeTruthy();
  });

  it("renders composite, scheduled workflow, secret sync, and gateway projections", () => {
    const { rerender } = renderPanel({
      type: "crossplane-composite",
      claim: false,
      paused: true,
      compositionRef: { apiVersion: null, kind: null, namespace: null, name: "postgres" },
      compositionRevisionRef: { apiVersion: null, kind: null, namespace: null, name: "postgres-7" },
      compositionUpdatePolicy: "Automatic",
      boundResourceRef: null,
      composedResourceRefs: [{ apiVersion: "sql.example.test/v1", kind: "Instance", namespace: "data", name: "db-1" }],
      conditions: [],
    });
    expect(screen.getByText("Instance · data · db-1")).toBeTruthy();
    expect(screen.getByText("Automatic")).toBeTruthy();

    rerender(panel({
      type: "cron-workflow",
      schedules: ["0 2 * * *"],
      timezone: "Asia/Seoul",
      suspended: false,
      concurrencyPolicy: "Forbid",
      lastScheduledTime: "2026-07-16T02:00:00Z",
      activeWorkflows: [{ apiVersion: null, kind: null, namespace: "ops", name: "backup-1" }],
      workflowTemplateRef: { apiVersion: null, kind: null, namespace: null, name: "backup-template" },
      workflowTemplateClusterScope: true,
      entrypoint: "backup",
      argumentCount: 2,
      templateCount: 1,
      successfulHistoryLimit: 3,
      failedHistoryLimit: 1,
      startingDeadlineSeconds: 60,
      conditions: [],
    }));
    expect(screen.getByText("0 2 * * *")).toBeTruthy();
    expect(screen.getByText("ops · backup-1")).toBeTruthy();

    rerender(panel({
      type: "external-secret",
      ready: true,
      lastSyncTime: "2026-07-16T00:00:00Z",
      refreshInterval: "1h",
      targetName: "api",
      syncedResourceVersion: "42",
      bindingName: null,
      storeName: "vault",
      storeKind: "ClusterSecretStore",
      mappings: [{ secretKey: "TOKEN", remoteKey: "prod/api", remoteProperty: "token", remoteVersion: null }],
      dataSources: [{ type: "extract", detail: "prod/common" }],
      targetCreationPolicy: "Owner",
      targetDeletionPolicy: "Retain",
      templateType: null,
      templateEngineVersion: null,
      templateLabels: [],
      templateAnnotations: [],
      conditions: [],
    }));
    expect(screen.getByText("TOKEN · prod/api · token")).toBeTruthy();
    expect(screen.getByText("ClusterSecretStore")).toBeTruthy();

    rerender(panel({
      type: "gateway-class",
      controllerName: "example.test/controller",
      description: "Production gateway",
      accepted: true,
      parametersRef: { apiVersion: "example.test", kind: "GatewayConfig", namespace: "network", name: "prod" },
      conditions: [],
    }));
    expect(screen.getByText("example.test/controller")).toBeTruthy();
    expect(screen.getByText("GatewayConfig · network · prod")).toBeTruthy();
  });
});

function renderPanel(detail: ProviderResourceDetail) {
  return render(panel(detail));
}

function panel(detail: ProviderResourceDetail) {
  return (
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <ProviderResourceDetailPanel detail={detail} />
    </I18nProvider>
  );
}
