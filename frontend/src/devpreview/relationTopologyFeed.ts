import { useEffect, useState } from "react";

import { getRelationTopology } from "../api/relation-topology";
import type { RelationTopologyEndpoint } from "../api/relation-topology-schemas";

// UI-PHASE2-001 TOP-01/TOP-07 · DEMO_WIRING_PLAN §3.4: a typed live adapter for
// the service-topology (Resource Flow) surface. Structure — node/edge identity,
// relation kind, evidence plane — comes from `GET /api/topology?view=relations`.
// This feed carries NO telemetry: RPS/p99/error rate are never derived from
// relation evidence (join traffic separately). A legitimately `unavailable`
// topology renders an honest empty state, never fabricated structure.

export type RelationTopologyStatus = "loading" | "ready" | "unavailable" | "error";

export type RelationNodeHealth = "ok" | "warn" | "unknown";

export type RelationNodeCategory =
  | "workload"
  | "pod"
  | "node"
  | "service"
  | "endpoint"
  | "event"
  | "other";

export type RelationEdgeKind = "owns" | "runs_on" | "selects" | "routes_to";

export interface RelationNodeView {
  id: string;
  name: string;
  kind: string;
  namespace: string | null;
  category: RelationNodeCategory;
  status: string;
  health: RelationNodeHealth;
  /** Stable cluster/namespace/name identity used to join traffic observations. */
  serviceKey: string;
}

export interface RelationEdgeView {
  id: string;
  from: string;
  to: string;
  kind: RelationEdgeKind;
}

export interface RelationTopologyView {
  status: RelationTopologyStatus;
  nodes: RelationNodeView[];
  edges: RelationEdgeView[];
  rootIds: string[];
  truncated: boolean;
  omittedNodeCount: number;
  omittedEdgeCount: number;
  partialReasonCodes: string[];
  clusterId: string | null;
}

const LOADING: RelationTopologyView = {
  status: "loading",
  nodes: [],
  edges: [],
  rootIds: [],
  truncated: false,
  omittedNodeCount: 0,
  omittedEdgeCount: 0,
  partialReasonCodes: [],
  clusterId: null,
};

/** Stable identity a topology node and a traffic endpoint can both produce. */
export function serviceKeyOf(
  clusterId: string,
  namespace: string | null,
  name: string,
): string {
  return `${clusterId}/${namespace ?? "-"}/${name}`;
}

function healthOf(raw: string): RelationNodeHealth {
  if (raw === "healthy") return "ok";
  if (raw === "degraded") return "warn";
  return "unknown";
}

export function toRelationTopologyView(
  endpoint: RelationTopologyEndpoint,
): RelationTopologyView {
  const base = {
    truncated: endpoint.truncated,
    omittedNodeCount: endpoint.omitted_node_count,
    omittedEdgeCount: endpoint.omitted_edge_count,
    partialReasonCodes: [...endpoint.partial_reason_codes],
    clusterId: endpoint.cluster.cluster_id,
  };
  if (endpoint.availability === "unavailable") {
    return { status: "unavailable", nodes: [], edges: [], rootIds: [], ...base };
  }
  const nodes: RelationNodeView[] = endpoint.nodes.map((node) => ({
    id: node.node_id,
    name: node.identity.name,
    kind: node.identity.kind,
    namespace: node.identity.namespace,
    category: node.category,
    status: node.status,
    health: healthOf(node.health),
    serviceKey: serviceKeyOf(
      node.identity.cluster_id,
      node.identity.namespace,
      node.identity.name,
    ),
  }));
  const edges: RelationEdgeView[] = endpoint.edges.map((edge) => ({
    id: edge.edge_id,
    from: edge.from_node_id,
    to: edge.to_node_id,
    kind: edge.kind,
  }));
  return { status: "ready", nodes, edges, rootIds: [...endpoint.root_node_ids], ...base };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

/**
 * Reads one relation-topology snapshot for the scoped clusters. A scope change
 * aborts the obsolete request so a stale response can never overwrite the new
 * selection. Never seeds state synchronously — only `.then/.catch` mutate.
 */
export function useRelationTopology(
  clusterIds: readonly string[],
): RelationTopologyView {
  const [view, setView] = useState<RelationTopologyView>(LOADING);
  const key = clusterIds.join(",");
  useEffect(() => {
    const ids = key ? key.split(",") : [];
    const controller = new AbortController();
    void getRelationTopology({ clusters: ids }, controller.signal)
      .then((endpoint) => {
        if (controller.signal.aborted) return;
        setView(toRelationTopologyView(endpoint));
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setView((prev) => ({ ...prev, status: "error" }));
      });
    return () => controller.abort();
  }, [key]);
  return view;
}
