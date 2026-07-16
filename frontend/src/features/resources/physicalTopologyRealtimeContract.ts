import type { RafStreamPolicy } from "../../shared/streaming/rafStreamCoalescer";

export type PhysicalTopologyRealtimeConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "closed";

export interface PhysicalTopologyRealtimeSubscription {
  workspaceId: string;
  clusterId: string;
}

/** Gateway-issued delivery policy. Sequence values remain server-owned. */
export interface PhysicalTopologyRealtimeStreamPolicy extends RafStreamPolicy {
  revision: number;
  maxPendingMessages: number;
}

export interface PhysicalTopologyRealtimeHandlers {
  onMessage(message: unknown): void;
  onPolicy(policy: PhysicalTopologyRealtimeStreamPolicy): void;
  onStatusChange(status: PhysicalTopologyRealtimeConnectionStatus): void;
}

export interface PhysicalTopologyRealtimePort {
  connect(
    subscription: PhysicalTopologyRealtimeSubscription,
    handlers: PhysicalTopologyRealtimeHandlers,
  ): () => void;
}

export const EMPTY_PHYSICAL_TOPOLOGY_REALTIME_PORT: PhysicalTopologyRealtimePort = {
  connect: () => () => undefined,
};
