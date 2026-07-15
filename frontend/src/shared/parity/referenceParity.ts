export type ScopeFreshness = "live" | "stale" | "partial" | "disconnected";

export interface ClusterScope {
  workspaceId: string;
  clusterId: string;
  namespaces?: readonly string[];
  freshness: ScopeFreshness;
}

export interface ResourceRef {
  apiGroup?: string;
  version?: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string;
}

export interface CapabilitySet {
  scope: ClusterScope;
  resource: ResourceRef;
  revision: string;
  actions: readonly string[];
}

export interface DirectCommandRequest {
  scope: ClusterScope;
  resource: ResourceRef;
  action: string;
  diff: Record<string, unknown>;
  confirmation: boolean;
  reason: string;
}

export interface CommandReceipt {
  accepted: boolean;
  commandId: string;
  auditId: string;
  status: "queued" | "leased" | "running" | "completed" | "failed" | "cancelled";
}

export interface OperationEvent {
  commandId: string;
  sequence: number;
  kind: "progress" | "log" | "completed" | "failed";
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface OperationEventsPort {
  subscribeOperationEvents(
    commandId: string,
    signal?: AbortSignal,
  ): AsyncIterable<OperationEvent>;
}

export function buildScopeKey(scope: ClusterScope): string {
  const namespaces = [...new Set(scope.namespaces ?? [])]
    .map((namespace) => namespace.trim())
    .filter(Boolean)
    .sort()
    .join(",");
  return `${scope.workspaceId}:${scope.clusterId}:${namespaces}`;
}

export function canDispatchDirectCommand(request: DirectCommandRequest): boolean {
  return request.confirmation
    && request.action.trim().length > 0
    && request.reason.trim().length > 0
    && request.resource.uid.trim().length > 0;
}
