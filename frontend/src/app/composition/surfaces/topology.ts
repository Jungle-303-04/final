import type { ComponentType } from "react";

import {
  createRealtimeClient,
  getPhysicalTopology,
  getRelationTopology,
} from "../../../api";
import type { HomePort } from "../../../features/home/homeContract";
import { createPhysicalTopologyAdapter } from "../../../features/resources/createPhysicalTopologyAdapter";
import { createRelationTopologyAdapter } from "../../../features/resources/createRelationTopologyAdapter";
import type {
  PhysicalTopologyRealtimePort,
  PhysicalTopologyRealtimeStreamPolicy,
} from "../../../features/resources/physicalTopologyRealtimeContract";
import { createTopologySurface } from "../../../pages/topology/createTopologySurface";

/**
 * Topology has a separate page and lazy route boundary. Only the typed graph
 * ports and graph primitives are shared with Resources, so either page can be
 * rolled back without replacing the other page's controller.
 */
export function loadTopologySurface(homePort: HomePort): ComponentType {
  const realtimePort: PhysicalTopologyRealtimePort = {
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
  };
  return createTopologySurface(
    createPhysicalTopologyAdapter({ getPhysicalTopology }),
    realtimePort,
    createRelationTopologyAdapter({ getRelationTopology }),
    homePort,
  );
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
