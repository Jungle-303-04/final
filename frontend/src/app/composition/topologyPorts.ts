import {
  createRealtimeClient,
  getPhysicalTopology,
  getRelationTopology,
} from "../../api";
import { createPhysicalTopologyAdapter } from "../../features/resources/createPhysicalTopologyAdapter";
import { createRelationTopologyAdapter } from "../../features/resources/createRelationTopologyAdapter";
import type { PhysicalTopologyPort } from "../../features/resources/physicalTopologyContract";
import type {
  PhysicalTopologyRealtimePort,
  PhysicalTopologyRealtimeStreamPolicy,
} from "../../features/resources/physicalTopologyRealtimeContract";
import type { RelationTopologyPort } from "../../features/resources/relationTopologyContract";

export interface TopologyPorts {
  physical: PhysicalTopologyPort;
  realtime: PhysicalTopologyRealtimePort;
  relation: RelationTopologyPort;
}

/**
 * Owns the topology API endpoints once and exposes reusable typed ports to
 * every product surface that renders topology data.
 */
export function createTopologyPorts(): TopologyPorts {
  return {
    physical: createPhysicalTopologyAdapter({ getPhysicalTopology }),
    realtime: {
      connect(subscription, handlers) {
        const client = createRealtimeClient({
          subscription,
          reconnect: { baseDelayMs: 3_000, maxDelayMs: 30_000 },
          onMessage: (message) => {
            if (message.type === "hello") {
              handlers.onPolicy(toPhysicalTopologyStreamPolicy(message.stream_policy));
              return;
            }
            if (message.type !== "ping") handlers.onMessage(message);
          },
          onStateChange: (state) => handlers.onStatusChange(state.status),
        });
        client.connect();
        return () => client.close();
      },
    },
    relation: createRelationTopologyAdapter({ getRelationTopology }),
  };
}

function toPhysicalTopologyStreamPolicy(policy: {
  revision: number;
  max_frames_per_second: number;
  hidden_tab: "coalesce";
  max_pending_messages: number;
}): PhysicalTopologyRealtimeStreamPolicy {
  return {
    revision: policy.revision,
    maxFramesPerSecond: policy.max_frames_per_second,
    hiddenTab: policy.hidden_tab,
    maxPendingMessages: policy.max_pending_messages,
  };
}
