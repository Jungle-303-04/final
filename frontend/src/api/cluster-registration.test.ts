import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  getProviderCatalog,
  getProviderClusterDiscovery,
  preflightTargetRegistration,
  registerTarget,
} from "./cluster-registration";

const CLOUD_PROVIDER = {
  category: "cloud",
  key: "eks",
  label: "Amazon EKS",
  status: "available",
  adapter: "aws eks update-kubeconfig + manual manifest bootstrap",
  capabilities: ["install_target_agent", "bootstrap_command"],
  credential_requirements: [],
  config_keys: [],
  config_fields: [
    {
      key: "region",
      label: "AWS region",
      required: true,
      kind: "text",
      options: [],
      description: "",
    },
  ],
  unavailable_reason: null,
};

const IMPORT_CANDIDATE = {
  cluster_id: "cluster-1",
  name: "cluster-1",
  source: "env:CLUSTER_CONTEXTS",
  cloud_provider: "existing-k8s",
  deploy_provider: "manual-manifest",
  kube_context: "cluster-1",
  external_handle: null,
  console_url: null,
  direct_apply_available: false,
  labels: { kube_context: "cluster-1" },
};

const DISCOVERY = {
  default_cloud_provider: "existing-k8s",
  default_deploy_provider: "manual-manifest",
  flows: [
    {
      cloud_provider: "existing-k8s",
      label: "Existing Kubernetes",
      status: "available",
      description: "Register an existing Kubernetes cluster.",
      deploy_providers: [{ key: "manual-manifest", future_field: true }],
      default_deploy_provider: "manual-manifest",
      supports_import: true,
      unavailable_reason: null,
      import_candidates: [IMPORT_CANDIDATE],
    },
  ],
  import_candidates: [IMPORT_CANDIDATE],
};

const SELECTION = {
  clusterRole: "target" as const,
  managementBaseUrl: "https://opsia.example.com",
  image: "ghcr.io/example/agent:sha-123",
  apply: false,
  kubeContext: null,
  cloudProvider: "eks",
  deployProvider: "manual-manifest",
  providerConfig: {
    region: "ap-northeast-2",
    eks_cluster_name: "production",
  },
};

const PREFLIGHT_RESPONSE = {
  valid: true,
  duplicate_cluster_id: false,
  provider_ready: true,
  agent_install_status: "never_connected",
  connection_status: "never_connected",
  kube_context_allowed: null,
  errors: [],
  warnings: [],
  selected: { cloud: { ...CLOUD_PROVIDER, additive_backend_metadata: true } },
  last_agent_id: null,
  last_seen_at: null,
};

const INSTALL_RESPONSE = {
  registered: true,
  cluster_id: "production",
  status: "pending_install",
  applied: false,
  apply_output: null,
  install_manifest: "apiVersion: v1\nkind: Secret",
  agent_token: "one-time-secret",
  install_command: "curl https://opsia.example.com/api/install/token | kubectl apply -f -",
  bootstrap_command: "aws eks update-kubeconfig && curl ... | kubectl apply -f -",
  bootstrap_steps: [
    { label: "Prepare kubeconfig", command: "aws eks update-kubeconfig" },
    { label: "Install agent", command: "curl ... | kubectl apply -f -" },
  ],
  connect_timeout_seconds: 1_800,
  connect_expires_at: "2026-07-13T07:00:00Z",
  connection_stage: "token_issued",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Cluster registration API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads the typed provider catalog without closing the category record", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ providers: { cloud: [CLOUD_PROVIDER], future_category: [] } }),
    );

    await expect(getProviderCatalog()).resolves.toEqual({
      providers: { cloud: [CLOUD_PROVIDER], future_category: [] },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/providers/catalog",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("loads discovery flows while preserving backend-declared JsonMap fields", async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(DISCOVERY),
    );

    await expect(getProviderClusterDiscovery(controller.signal)).resolves.toEqual(DISCOVERY);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/providers/cluster-discovery",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("preflights a provider-neutral target without accepting a workspace identity", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(PREFLIGHT_RESPONSE),
    );

    await expect(preflightTargetRegistration({
      ...SELECTION,
      clusterId: "production",
      name: "Production",
      environment: "production",
    })).resolves.toEqual(PREFLIGHT_RESPONSE);

    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/targets/preflight");
    expect(init).toMatchObject({ credentials: "include", method: "POST" });
    expect(JSON.parse(String(init?.body))).toEqual({
      cluster_role: "target",
      management_base_url: "https://opsia.example.com",
      image: "ghcr.io/example/agent:sha-123",
      apply: false,
      kube_context: null,
      cloud_provider: "eks",
      deploy_provider: "manual-manifest",
      provider_config: SELECTION.providerConfig,
      cluster_id: "production",
      name: "Production",
      environment: "production",
    });
    expect(String(init?.body)).not.toContain("workspace");
  });

  it("accepts a business-invalid preflight as a valid HTTP response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...PREFLIGHT_RESPONSE,
      valid: false,
      provider_ready: false,
      errors: ["target_provider_invalid"],
    }));

    await expect(preflightTargetRegistration({
      ...SELECTION,
      clusterId: "production",
    })).resolves.toMatchObject({
      valid: false,
      errors: ["target_provider_invalid"],
    });
  });

  it("registers once and returns the server-issued ephemeral install receipt", async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(INSTALL_RESPONSE),
    );

    await expect(registerTarget({
      ...SELECTION,
      clusterId: "production",
      name: "Production",
      environment: "production",
    }, controller.signal)).resolves.toEqual(INSTALL_RESPONSE);

    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/targets");
    expect(init).toMatchObject({ method: "POST", signal: controller.signal });
    expect(JSON.parse(String(init?.body))).toEqual(expect.objectContaining({
      cluster_id: "production",
      cloud_provider: "eks",
      deploy_provider: "manual-manifest",
    }));
    expect(String(init?.body)).not.toContain("prometheus_base_url");
    expect(String(init?.body)).not.toContain("workspace");
  });

  it("does not retry a possibly-sent registration mutation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("connection closed after request write"),
    );

    await expect(registerTarget({
      ...SELECTION,
      clusterId: "production",
      name: "Production",
      environment: "production",
    })).rejects.toMatchObject({ kind: "network" } satisfies Partial<ApiError>);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    ["catalog envelope", () => getProviderCatalog(), {
      providers: { cloud: [CLOUD_PROVIDER] },
      trace_id: "unknown",
    }],
    ["catalog provider", () => getProviderCatalog(), {
      providers: { cloud: [{ ...CLOUD_PROVIDER, unknown: true }] },
    }],
    ["discovery flow", () => getProviderClusterDiscovery(), {
      ...DISCOVERY,
      flows: [{ ...DISCOVERY.flows[0], unknown: true }],
    }],
    ["preflight envelope", () => preflightTargetRegistration({
      ...SELECTION,
      clusterId: "production",
    }), { ...PREFLIGHT_RESPONSE, unknown: true }],
    ["install receipt", () => registerTarget({
      ...SELECTION,
      clusterId: "production",
      name: "Production",
      environment: "production",
    }), { ...INSTALL_RESPONSE, unknown: true }],
  ])("rejects an unknown field in the %s", async (_label, request, payload) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));

    await expect(request()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });
});
