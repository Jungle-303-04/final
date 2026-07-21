import { useEffect, useState } from "react";

import { getClusterConnectStatus } from "../api/cluster-connect";
import type { ClusterConnectStatusResponse } from "../api/cluster-connect-schemas";
import {
  getProviderCatalog,
  getProviderClusterDiscovery,
  preflightTargetRegistration,
  registerTarget,
} from "../api/cluster-registration";
import type {
  ProviderCatalog,
  ProviderClusterDiscovery,
  TargetInstallResponse,
  TargetPreflightResponse,
} from "../api/cluster-registration-schemas";

// UI-PHASE2-001 · CON-01..CON-09 / §2 "Connect cluster" / §5 side-effects.
//
// Typed live adapters for the environment connect wizard. Rules mirror
// checksFeed.ts / sessionFeed.ts: a typed `status` union, no synchronous
// setState at the top of a useEffect (eslint `react-hooks/set-state-in-effect`),
// a scope change aborts the previous request, and NO backfill — an absent
// server capability renders honest `unavailable`, never a fabricated success.
//
// SAFETY (plan §5): this runs against a shared live backend. Only GET reads
// auto-run on mount here (catalog / discovery / connection status). Target
// registration is a real mutation that creates external state; the preflight
// and register helpers below are plain imperative functions and are NEVER
// invoked from an effect or a timer — the wizard calls them only from an
// explicit user button click. Secret agent tokens returned by registration are
// never persisted or logged by this module.

export type ConnectFeedStatus = "loading" | "ready" | "unavailable" | "error";

// ── Repository discovery honest gap ─────────────────────────────
// The `/api/repositories/discovery/*` endpoints were a dev-only module and the
// front snapshot ships no client for them under `src/api/`. `src/api/**` is
// read-only for this task, so we cannot add one. The wizard therefore keeps its
// local URL parser as a pre-check but must present server probe / branch /
// manifest discovery as an honest "미지원(gap)" state — it must not fabricate
// detection results.
export const REPOSITORY_DISCOVERY_SUPPORTED = false as const;
export const REPOSITORY_DISCOVERY_GAP_REASON =
  "저장소 서버 디스커버리(probe·branches·manifests) 클라이언트가 이 빌드에 없어 " +
  "서버 확인은 미지원입니다. 아래는 주소 형식 검증(로컬)만 수행합니다.";

// ── Provider availability (catalog + cluster discovery) ─────────────────────

export interface ProviderAvailability {
  key: string;
  label: string;
  available: boolean;
  unavailableReason: string | null;
}

export interface ClusterProvidersView {
  status: ConnectFeedStatus;
  /** Registration flows keyed by cloud provider (e.g. `eks`, `gke`, `aks`). */
  cloudProviders: Map<string, ProviderAvailability>;
  /** Source SCM providers (e.g. `github`) for the repository sub-wizard. */
  sourceProviders: ProviderAvailability[];
  defaultCloudProvider: string | null;
  defaultDeployProvider: string | null;
  /** Server-advertised default deploy provider for a given cloud provider. */
  deployProviderFor: (cloudProvider: string) => string | null;
}

const EMPTY_PROVIDERS: ClusterProvidersView = {
  status: "loading",
  cloudProviders: new Map(),
  sourceProviders: [],
  defaultCloudProvider: null,
  defaultDeployProvider: null,
  deployProviderFor: () => null,
};

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

function toClusterProvidersView(
  catalog: ProviderCatalog,
  discovery: ProviderClusterDiscovery,
): ClusterProvidersView {
  const cloudProviders = new Map<string, ProviderAvailability>();
  const deployByCloud = new Map<string, string>();
  for (const flow of discovery.flows) {
    cloudProviders.set(flow.cloud_provider, {
      key: flow.cloud_provider,
      label: flow.label,
      available: flow.status === "available",
      unavailableReason: flow.unavailable_reason,
    });
    deployByCloud.set(flow.cloud_provider, flow.default_deploy_provider);
  }

  const sourceProviders: ProviderAvailability[] = (catalog.providers.source ?? []).map(
    (provider) => ({
      key: provider.key,
      label: provider.label,
      available: provider.status === "available",
      unavailableReason: provider.unavailable_reason,
    }),
  );

  return {
    status: cloudProviders.size > 0 ? "ready" : "unavailable",
    cloudProviders,
    sourceProviders,
    defaultCloudProvider: discovery.default_cloud_provider,
    defaultDeployProvider: discovery.default_deploy_provider,
    deployProviderFor: (cloudProvider: string) => deployByCloud.get(cloudProvider) ?? null,
  };
}

/**
 * Loads the live provider catalog and cluster-discovery flows.
 * Both are read-only GETs, safe to run on mount.
 */
export function useClusterProviders(): ClusterProvidersView {
  const [view, setView] = useState<ClusterProvidersView>(EMPTY_PROVIDERS);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      getProviderCatalog(controller.signal),
      getProviderClusterDiscovery(controller.signal),
    ])
      .then(([catalog, discovery]) => {
        if (controller.signal.aborted) return;
        setView(toClusterProvidersView(catalog, discovery));
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setView((prev) => ({ ...prev, status: "error" }));
      });
    return () => controller.abort();
  }, []);
  return view;
}

// ── Connection status polling ───────────────────────────────────────────────

export type ConnectionPollStatus = "idle" | "loading" | "ready" | "error";

export interface ConnectionStatusView {
  status: ConnectionPollStatus;
  /** `waiting` | `connected` | `expired` once a status has been observed. */
  connection: ClusterConnectStatusResponse["status"] | null;
  agentVersion: string | null;
  connectedAt: string | null;
}

const IDLE_CONNECTION: ConnectionStatusView = {
  status: "idle",
  connection: null,
  agentVersion: null,
  connectedAt: null,
};

const POLL_INTERVAL_MS = 3000;

/**
 * Polls the real connection status for a registered cluster.
 *
 * When `clusterId` is `null` (no registration yet) this stays idle and issues
 * no request — completion is never faked by a timer. Polling stops once the
 * server reports a terminal `connected` / `expired` status.
 */
export function useClusterConnectionStatus(clusterId: string | null): ConnectionStatusView {
  const [view, setView] = useState<ConnectionStatusView>(IDLE_CONNECTION);

  useEffect(() => {
    if (!clusterId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const poll = () => {
      void getClusterConnectStatus(clusterId, controller.signal)
        .then((response) => {
          if (cancelled || controller.signal.aborted) return;
          setView({
            status: "ready",
            connection: response.status,
            agentVersion: response.agent_version,
            connectedAt: response.connected_at,
          });
          if (response.status === "waiting") {
            timer = setTimeout(poll, POLL_INTERVAL_MS);
          }
        })
        .catch((cause: unknown) => {
          if (cancelled || controller.signal.aborted || isAbortError(cause)) return;
          setView((prev) => ({ ...prev, status: "error" }));
        });
    };
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  }, [clusterId]);

  return view;
}

// ── Target registration (explicit-click mutations only) ─────────────────────

export interface ClusterTargetFields {
  /** Wizard platform id mapped to a live discovery cloud provider. */
  cloudProvider: string;
  deployProvider: string;
  name: string;
  environment: string;
  /** Provider-specific values advertised by the provider catalog. */
  providerConfig: Record<string, unknown>;
}

function slugId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function baseSelection(fields: ClusterTargetFields) {
  return {
    clusterRole: "target" as const,
    // The agent reports back to this origin; a preview build cannot know the
    // management cluster's internal URL, so the server validates/defaults it.
    managementBaseUrl: window.location.origin,
    // Agent image is a management-cluster deployment value the browser does not
    // hold; left blank so the server reports its own default or a real error.
    image: "",
    // Non-destructive: register the target record and issue a bootstrap
    // command WITHOUT applying anything to a live cluster.
    apply: false,
    kubeContext: null,
    cloudProvider: fields.cloudProvider,
    deployProvider: fields.deployProvider,
    providerConfig: fields.providerConfig,
  };
}

/**
 * Runs a real, non-mutating preflight validation. Safe to call on an explicit
 * click; issues no agent credential and creates no target.
 */
export function preflightClusterTarget(
  fields: ClusterTargetFields,
  signal?: AbortSignal,
): Promise<TargetPreflightResponse> {
  return preflightTargetRegistration({
    ...baseSelection(fields),
    clusterId: slugId(fields.name),
    name: fields.name,
    environment: fields.environment,
  }, signal);
}

/**
 * Registers a target. THIS IS A REAL MUTATION — the wizard must call it only
 * from an explicit user confirmation, never from an effect or timer. The
 * returned receipt carries a one-time `agent_token`; keep it in ephemeral
 * component state only and never persist or log it.
 */
export function registerClusterTarget(
  fields: ClusterTargetFields,
  signal?: AbortSignal,
): Promise<TargetInstallResponse> {
  return registerTarget({
    ...baseSelection(fields),
    // Keep the mutation bound to the exact identity that passed preflight.
    // Letting the server generate a suffixed id here would validate one target
    // and register another, defeating duplicate and policy checks.
    clusterId: slugId(fields.name),
    name: fields.name,
    environment: fields.environment,
  }, signal);
}

/** Maps a wizard platform id to its live cluster-discovery cloud provider key. */
export const PLATFORM_CLOUD_PROVIDER: Record<string, string> = {
  aws: "eks",
  gcp: "gke",
  azure: "aks",
  docker: "existing-k8s",
};

// 클러스터 등록 도메인의 api 유틸/타입도 이 어댑터 경계를 통해서만 노출한다.
export { isApiError } from "../api/client";
export type { TargetInstallResponse, TargetPreflightResponse } from "../api/cluster-registration-schemas";
