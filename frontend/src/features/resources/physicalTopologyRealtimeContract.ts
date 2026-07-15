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

export interface PhysicalTopologyRealtimeHandlers {
  onMessage(message: unknown): void;
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
