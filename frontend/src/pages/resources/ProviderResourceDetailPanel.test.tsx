// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import type { ProviderResourceDetail } from "../../features/resources/providerResourceContract";
import { ProviderResourceDetailPanel } from "./ProviderResourceDetailPanel";
import type { ResourceMetricsHistoryFrame } from "./useResourceMetricsHistoryDataFrame";

afterEach(cleanup);

describe("ProviderResourceDetailPanel", () => {
  it("renders observed PVC usage with Prometheus provenance and freshness", () => {
    renderPanel(pvcDetail(), pvcMetricFrame({
      completeness: "exact",
      freshness: "live",
      volumeUsagePercent: 74,
    }), "pvc:shop/cache");

    expect(screen.getByRole("heading", { name: "Observed volume usage" })).toBeTruthy();
    expect(screen.getByText("74.0%")).toBeTruthy();
    expect(screen.getByText("Prometheus")).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByText("Exact")).toBeTruthy();
  });

  it("keeps PVC usage unavailable when only capacity inventory exists", () => {
    renderPanel(pvcDetail(), pvcMetricFrame({
      completeness: "unavailable",
      freshness: "disconnected",
      volumeUsagePercent: null,
    }), "pvc:shop/cache");

    expect(screen.getByText("Observed usage unavailable")).toBeTruthy();
    expect(screen.getByText("Prometheus")).toBeTruthy();
    expect(screen.getByText("Disconnected")).toBeTruthy();
    expect(screen.getAllByText("20Gi")).toHaveLength(2);
    expect(screen.queryByText("100%")).toBeNull();
  });

  it("marks observed PVC usage partial and preserves coverage reasons", () => {
    renderPanel(pvcDetail(), pvcMetricFrame({
      completeness: "partial",
      freshness: "partial",
      volumeUsagePercent: 41.25,
    }), "pvc:shop/cache");

    expect(screen.getByText("41.3%")).toBeTruthy();
    expect(screen.getAllByText("Partial")).toHaveLength(2);
    expect(screen.getByText("pvc_metric_partial")).toBeTruthy();
  });

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

  it("renders GCP machine, control-plane, and node-pool projections without defaults", () => {
    const { rerender } = renderPanel({
      type: "gcp-machine",
      ready: true,
      instanceType: "n2-standard-4",
      zone: "asia-northeast3-a",
      instanceId: "projects/p/zones/z/instances/node-1",
      image: "cos-stable",
      additionalDisks: [{ deviceType: "pd-balanced", sizeGb: 200 }],
      conditions: [],
    });
    expect(screen.getByText("n2-standard-4")).toBeTruthy();
    expect(screen.getByText("pd-balanced · 200 GB")).toBeTruthy();

    rerender(panel({
      type: "gcp-managed-control-plane",
      ready: true,
      clusterName: "prod",
      project: "platform-prod",
      location: "asia-northeast3",
      version: "1.33.2-gke.100",
      releaseChannel: "regular",
      autopilot: true,
      endpoint: "34.64.1.2",
      podCidr: "10.20.0.0/16",
      serviceCidr: "10.30.0.0/20",
      ipAliases: true,
      loggingService: "logging.googleapis.com/kubernetes",
      monitoringService: "monitoring.googleapis.com/kubernetes",
      authorizedNetworks: [{ name: "office", cidr: "203.0.113.0/24" }],
      conditions: [],
    }));
    expect(screen.getByText("platform-prod")).toBeTruthy();
    expect(screen.getByText("office · 203.0.113.0/24")).toBeTruthy();

    rerender(panel({
      type: "gcp-managed-machine-pool",
      ready: false,
      nodePoolName: "workers",
      machineType: "n2-standard-8",
      diskType: "pd-balanced",
      diskSizeGb: 150,
      imageType: "COS_CONTAINERD",
      maxPodsPerNode: 64,
      autoscalingEnabled: true,
      scaling: { minimum: 3, maximum: 20, current: 5 },
      autoRepair: true,
      autoUpgrade: false,
      nodeLocations: ["asia-northeast3-a", "asia-northeast3-b"],
      labels: [{ key: "pool", value: "workers" }],
      taints: [{ key: "dedicated", value: "batch", effect: "NoSchedule" }],
      conditions: [],
    }));
    expect(screen.getByText("workers")).toBeTruthy();
    expect(screen.getByText("pool=workers")).toBeTruthy();
    expect(screen.getByText("dedicated · batch · NoSchedule")).toBeTruthy();
  });

  it("renders structured Gateway API rules and server-owned Job state", () => {
    const { rerender } = renderPanel({
      type: "http-route",
      hostnames: ["api.example.test"],
      parentRefs: [{ apiVersion: null, kind: null, namespace: "shop", name: "public" }],
      rules: [{
        matches: [{
          method: "GET",
          pathType: "PathPrefix",
          pathValue: "/inventory",
          grpcType: null,
          grpcService: null,
          grpcMethod: null,
          headers: [],
          queryParams: [{ key: "region", value: "kr" }],
        }],
        backends: [{
          reference: { apiVersion: null, kind: null, namespace: "shop", name: "inventory" },
          port: 8080,
          weight: 100,
        }],
        filters: [{ type: "RequestHeaderModifier", summary: "set: x-platform" }],
      }],
      parentStatuses: [{
        reference: { apiVersion: null, kind: null, namespace: "shop", name: "public" },
        sectionName: null,
        accepted: true,
        resolvedRefs: true,
        conditions: [],
      }],
      conditions: [],
    });

    expect(screen.getByRole("heading", { name: "Rule 1" })).toBeTruthy();
    expect(screen.getByLabelText("GET · PathPrefix · /inventory · Query parameters: region=kr")).toBeTruthy();
    expect(screen.getByLabelText("shop · inventory · Port 8080 · Weight 100")).toBeTruthy();
    expect(screen.getByLabelText("shop · public · Accepted · References resolved")).toBeTruthy();

    rerender(panel({
      type: "grpc-route",
      hostnames: ["grpc.example.test"],
      parentRefs: [],
      rules: [{
        matches: [{
          method: null,
          pathType: null,
          pathValue: null,
          grpcType: "Exact",
          grpcService: "shop.Inventory",
          grpcMethod: "Get",
          headers: [],
          queryParams: [],
        }],
        backends: [],
        filters: [],
      }],
      parentStatuses: [],
      conditions: [],
    }));
    expect(screen.getByLabelText("Exact · shop.Inventory · Get")).toBeTruthy();

    rerender(panel({
      type: "job",
      state: "completed",
      succeeded: 4,
      failed: 1,
      active: 0,
      completions: 4,
      parallelism: 2,
      backoffLimit: 5,
      activeDeadlineSeconds: 600,
      ttlSecondsAfterFinished: 3600,
      suspended: false,
      startTime: "2026-07-16T00:00:00Z",
      completionTime: "2026-07-16T00:03:00Z",
      terminalReason: "CompletionsReached",
      terminalMessage: null,
      conditions: [],
    }));
    expect(screen.getByText("CompletionsReached")).toBeTruthy();
    expect(screen.getByText("600s")).toBeTruthy();
    expect(screen.getByText("3600s")).toBeTruthy();
  });

  it("renders shared Karpenter and KEDA details without exposing trigger values", () => {
    const { rerender } = renderPanel({
      type: "karpenter-ec2-node-class",
      ready: true,
      role: "KarpenterNodeRole",
      instanceProfile: "nodes",
      amiFamily: "AL2023",
      amiSelectorTerms: [{
        id: null,
        name: null,
        alias: "al2023@latest",
        owner: null,
        tags: [],
      }],
      blockDevices: [{
        deviceName: "/dev/xvda",
        volumeType: "gp3",
        volumeSize: "100Gi",
        iops: 3000,
        throughput: 125,
        encrypted: true,
        deleteOnTermination: true,
      }],
      subnetSelectorTerms: [],
      securityGroupSelectorTerms: [],
      metadataOptions: {
        httpTokens: "required",
        httpPutResponseHopLimit: 2,
        httpEndpoint: "enabled",
      },
      resolvedAmis: [{
        id: "ami-123",
        name: "al2023",
        requirements: [],
      }],
      resolvedSubnets: [{ id: "subnet-a", name: null, zone: "ap-northeast-2a" }],
      resolvedSecurityGroups: [{ id: "sg-a", name: "nodes", zone: null }],
      tags: [{ key: "team", value: "platform" }],
      conditions: [],
    });
    expect(screen.getByText("KarpenterNodeRole")).toBeTruthy();
    expect(screen.getByText(/\/dev\/xvda/)).toBeTruthy();
    expect(screen.getByText("ami-123 · al2023")).toBeTruthy();

    rerender(panel({
      type: "karpenter-node-claim",
      state: "registered",
      instanceType: "m7g.large",
      capacityType: "spot",
      nodeName: "ip-10-0-0-1",
      zone: "ap-northeast-2a",
      architecture: "arm64",
      nodePool: "general",
      nodeClassRef: {
        apiVersion: "karpenter.k8s.aws",
        kind: "EC2NodeClass",
        namespace: null,
        name: "default",
      },
      imageId: "ami-123",
      expireAfter: "720h",
      capacity: { cpu: "2", memory: "8Gi", pods: "29", ephemeralStorage: null },
      requirements: [{
        key: "kubernetes.io/arch",
        operator: "In",
        values: ["arm64"],
        minValues: null,
      }],
      conditions: [],
    }));
    expect(screen.getByText("Registered")).toBeTruthy();
    expect(screen.getByText("EC2NodeClass · default")).toBeTruthy();

    rerender(panel({
      type: "karpenter-node-pool",
      ready: true,
      nodeClassRef: {
        apiVersion: "karpenter.k8s.aws",
        kind: "EC2NodeClass",
        namespace: null,
        name: "default",
      },
      limitCpu: "100",
      limitMemory: "400Gi",
      weight: 50,
      currentCpu: "24",
      currentMemory: "96Gi",
      consolidationPolicy: "WhenEmptyOrUnderutilized",
      consolidateAfter: "5m",
      expireAfter: "720h",
      disruptionBudgets: [{ nodes: "10%", schedule: null, duration: "2h" }],
      templateLabels: [{ key: "team", value: "platform" }],
      templateTaints: [{ key: "dedicated", value: "batch", effect: "NoSchedule" }],
      startupTaints: [],
      requirements: [],
      conditions: [],
    }));
    expect(screen.getByText("WhenEmptyOrUnderutilized")).toBeTruthy();
    expect(screen.getByText("team=platform")).toBeTruthy();

    rerender(panel({
      type: "keda-scaled-object",
      state: "active",
      targetRef: { apiVersion: null, kind: "Deployment", namespace: "shop", name: "api" },
      scaling: { minimum: 1, maximum: 20, current: null },
      idleReplicas: null,
      pollingIntervalSeconds: 15,
      cooldownPeriodSeconds: 60,
      hpaName: "keda-hpa-api",
      lastActiveTime: "2026-07-16T00:00:00Z",
      fallbackFailureThreshold: null,
      fallbackReplicas: null,
      restoreOriginalReplicas: false,
      scaleUpStabilizationSeconds: null,
      scaleDownStabilizationSeconds: null,
      scalingPolicies: [],
      triggers: [{
        type: "rabbitmq",
        name: "orders",
        authenticationRef: {
          apiVersion: null,
          kind: "TriggerAuthentication",
          namespace: "shop",
          name: "rabbitmq",
        },
        metadataKeys: ["queueName"],
        redactedMetadataCount: 2,
      }],
      conditions: [],
    }));
    expect(screen.getByText("Deployment · shop · api")).toBeTruthy();
    expect(screen.getByText("queueName")).toBeTruthy();
    expect(screen.getByText("2 values withheld")).toBeTruthy();
    expect(screen.queryByText("connectionString")).toBeNull();

    rerender(panel({
      type: "keda-scaled-job",
      state: "idle",
      jobTargetName: "worker",
      strategy: "accurate",
      pollingIntervalSeconds: 30,
      successfulHistoryLimit: 3,
      failedHistoryLimit: 2,
      minimumReplicas: 0,
      maximumReplicas: 10,
      triggers: [],
      conditions: [],
    }));
    expect(screen.getByText("Idle")).toBeTruthy();
    expect(screen.getByText("accurate")).toBeTruthy();
  });

  it("searches and expands Prometheus rules and reuses the route presentation for TLS", () => {
    const longExpression = `sum(rate(http_requests_total[5m])) ${"+ vector(0) ".repeat(30)}`;
    const { rerender } = renderPanel({
      type: "prometheus-rule",
      groupCount: 1,
      totalRules: 6,
      totalAlerts: 1,
      totalRecordings: 5,
      projectedRules: 6,
      truncated: false,
      groups: [{
        name: "api",
        interval: "30s",
        ruleCount: 6,
        alertCount: 1,
        recordingCount: 5,
        rules: [
          {
            type: "alert",
            name: "HighErrorRate",
            expression: longExpression,
            duration: "10m",
            severity: "critical",
            summary: "API error rate is high",
            description: null,
            labels: [{ key: "severity", value: "critical" }],
          },
          ...Array.from({ length: 5 }, (_, index) => ({
            type: "recording" as const,
            name: `api:requests:rate${index}`,
            expression: "vector(1)",
            duration: null,
            severity: null,
            summary: null,
            description: null,
            labels: [],
          })),
        ],
      }],
      conditions: [],
    });

    expect(screen.getByText("HighErrorRate")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getByText((_, element) => (
      element?.tagName === "PRE" && element.textContent === longExpression
    ))).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search Prometheus rules" }), {
      target: { value: "HighErrorRate" },
    });
    expect(screen.getByText("1 of 6")).toBeTruthy();
    expect(screen.queryByText("api:requests:rate0")).toBeNull();

    rerender(panel({
      type: "tls-route",
      hostnames: ["tls.example.test"],
      parentRefs: [],
      rules: [{
        matches: [],
        backends: [{
          reference: {
            apiVersion: null,
            kind: null,
            namespace: "network",
            name: "tls-api",
          },
          port: 9443,
          weight: 100,
        }],
        filters: [],
      }],
      parentStatuses: [],
      conditions: [],
    }));
    expect(screen.getByText("tls.example.test")).toBeTruthy();
    expect(screen.getByLabelText("network · tls-api · Port 9443 · Weight 100")).toBeTruthy();
  });

  it("filters bounded SBOM and vulnerability evidence and opens only the typed link", () => {
    const openExternalUrl = vi.fn(async () => undefined);
    const components = Array.from({ length: 102 }, (_, index) => ({
      name: `component-${index}`,
      version: `1.${index}`,
      type: "library",
      packageUrl: `pkg:npm/component-${index}@1.${index}`,
      packageUrlQualifiersRedacted: index === 0,
      license: "MIT",
    }));
    const { rerender } = render(panel({
      type: "sbom-report",
      containerName: "api",
      image: "registry.example.test/platform/api:1.2.3",
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      componentCount: 120,
      dependencyCount: 42,
      observedComponentCount: 120,
      projectedComponentCount: 102,
      truncated: true,
      scannerName: "Trivy",
      scannerVersion: "0.64.1",
      scannedAt: "2026-07-16T00:00:00Z",
      components,
      conditions: [],
    }, openExternalUrl));

    expect(screen.getByText("CycloneDX · 1.6")).toBeTruthy();
    expect(screen.queryByText("component-101")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show all 102 components" }));
    expect(screen.getByText("component-101")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search software components" }), {
      target: { value: "component-101" },
    });
    expect(screen.getByText("1 of 102 components")).toBeTruthy();
    expect(screen.queryByText("component-0")).toBeNull();

    rerender(panel({
      type: "vulnerability-report",
      containerName: "api",
      image: "registry.example.test/platform/api:1.2.3",
      osFamily: "debian",
      osName: "12",
      osEndOfServiceLife: false,
      scannerName: "Trivy",
      scannerVersion: "0.64.1",
      scannedAt: "2026-07-16T00:00:00Z",
      severity: { critical: 1, high: 1, medium: 0, low: 0, unknown: 0 },
      observedVulnerabilityCount: 2,
      projectedVulnerabilityCount: 2,
      truncated: false,
      vulnerabilities: [
        {
          vulnerabilityId: "CVE-2026-0001",
          severity: "CRITICAL",
          score: 9.8,
          package: "openssl",
          installedVersion: "3.0.1",
          fixedVersion: "3.0.2",
          primaryLink: "https://security.example.test/CVE-2026-0001",
        },
        {
          vulnerabilityId: "CVE-2026-0002",
          severity: "HIGH",
          score: 7.5,
          package: "curl",
          installedVersion: "8.0.0",
          fixedVersion: null,
          primaryLink: null,
        },
      ],
      conditions: [],
    }, openExternalUrl));

    expect(screen.getByText("1 critical vulnerabilities require attention")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search vulnerabilities" }), {
      target: { value: "openssl" },
    });
    expect(screen.getByText("1 of 2 vulnerabilities")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Fix available" }));
    expect(screen.queryByText("CVE-2026-0002")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.click(screen.getByRole("button", { name: "High 1" }));
    expect(screen.getByText("CVE-2026-0002")).toBeTruthy();
    expect(screen.queryByText("CVE-2026-0001")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.click(screen.getByRole("button", {
      name: "Open verified reference for CVE-2026-0001",
    }));
    expect(openExternalUrl).toHaveBeenCalledWith(
      "https://security.example.test/CVE-2026-0001",
    );
  });

  it("renders redacted secret metadata and hierarchical workflow execution", () => {
    const { rerender } = renderPanel({
      type: "secret",
      secretType: "Opaque",
      immutable: true,
      keyNames: ["password", "username"],
      conditions: [],
    });

    expect(screen.getByText("Secret metadata")).toBeTruthy();
    expect(screen.getByText("password · username")).toBeTruthy();
    expect(screen.queryByText("c2VjcmV0")).toBeNull();

    rerender(panel({
      type: "workflow",
      phase: "Failed",
      startedAt: "2026-07-16T00:00:00Z",
      finishedAt: "2026-07-16T00:01:00Z",
      progress: "1/2",
      estimatedDurationSeconds: 60,
      workflowTemplateRef: {
        apiVersion: "argoproj.io",
        kind: "WorkflowTemplate",
        namespace: "shop",
        name: "release",
      },
      argumentNames: ["environment"],
      resourceDurations: [{ key: "cpu", value: "12" }],
      executionNodes: [
        {
          id: "root",
          label: "release",
          nodeType: "DAG",
          phase: "Failed",
          depth: 0,
          startedAt: "2026-07-16T00:00:00Z",
          finishedAt: "2026-07-16T00:01:00Z",
          message: null,
          templateRef: null,
        },
        {
          id: "publish",
          label: "publish",
          nodeType: "Pod",
          phase: "Error",
          depth: 1,
          startedAt: null,
          finishedAt: null,
          message: "image pull failed",
          templateRef: null,
        },
      ],
      observedNodeCount: 2,
      projectedNodeCount: 2,
      truncated: false,
      problemSummaries: ["publish: image pull failed"],
      conditions: [],
    }));

    expect(screen.getByRole("heading", { name: "Execution" })).toBeTruthy();
    expect(screen.getByText("2 of 2 nodes")).toBeTruthy();
    expect(screen.getByText("publish: image pull failed")).toBeTruthy();
    expect(document.querySelector("[data-workflow-node='publish']")).toBeTruthy();
  });
});

function renderPanel(
  detail: ProviderResourceDetail,
  metricHistory?: ResourceMetricsHistoryFrame,
  resourceId?: string,
) {
  return render(panel(detail, undefined, metricHistory, resourceId));
}

function panel(
  detail: ProviderResourceDetail,
  onOpenExternalUrl?: (url: string) => Promise<void>,
  metricHistory?: ResourceMetricsHistoryFrame,
  resourceId?: string,
) {
  return (
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <ProviderResourceDetailPanel
        detail={detail}
        metricHistory={metricHistory}
        onOpenExternalUrl={onOpenExternalUrl}
        resourceId={resourceId}
      />
    </I18nProvider>
  );
}

function pvcDetail(): ProviderResourceDetail {
  return {
    type: "persistent-volume-claim",
    phase: "Bound",
    capacity: "20Gi",
    requested: "20Gi",
    storageClassName: "gp3",
    accessModes: ["ReadWriteOnce"],
    volumeMode: "Filesystem",
    volumeName: "pvc-volume",
    provisioner: "ebs.csi.aws.com",
    selectedNode: null,
    bindCompleted: true,
    conditions: [],
  };
}

function pvcMetricFrame(input: {
  completeness: "exact" | "partial" | "unavailable";
  freshness: "live" | "stale" | "partial" | "disconnected";
  volumeUsagePercent: number | null;
}): ResourceMetricsHistoryFrame {
  const series = input.volumeUsagePercent === null ? [] : [{
    resourceId: "pvc:shop/cache",
    clusterId: "cluster-a",
    resourceType: "pvc" as const,
    namespace: "shop",
    name: "cache",
    points: [{
      observedAt: "2026-07-17T00:01:00.000Z",
      cpuMillicores: null,
      memoryMebibytes: null,
      volumeUsagePercent: input.volumeUsagePercent,
    }],
    hasSparklinePoints: false,
    completeness: input.completeness,
    partialReasonCodes: input.completeness === "exact"
      ? []
      : [input.completeness === "partial" ? "pvc_metric_partial" : "pvc_metric_unavailable"],
    source: "prometheus" as const,
    freshness: input.freshness,
  }];
  return {
    phase: "ready",
    data: {
      refreshPolicyKey: "metrics_pvc",
      series,
      completeness: input.completeness,
      partialReasonCodes: input.completeness === "exact"
        ? []
        : [input.completeness === "partial" ? "pvc_metric_partial" : "pvc_metric_unavailable"],
      snapshot: {
        snapshotRevision: 42,
        authorizationRevision: "auth-42",
        filterFingerprint: "filter-42",
        observedAt: "2026-07-17T00:01:00.000Z",
        stale: input.freshness !== "live",
        partialReasonCodes: [],
      },
      source: "prometheus",
      sourceFreshness: input.freshness,
    },
    failure: null,
    refreshFailure: null,
    refreshing: false,
    unavailableRetry: null,
  };
}
