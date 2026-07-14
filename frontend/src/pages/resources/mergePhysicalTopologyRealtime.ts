import type {
  PhysicalTopologyPod,
  PhysicalTopologySnapshot,
} from "../../features/resources/physicalTopologyContract";
import {
  podIdentity,
  type LivePodMeasurement,
} from "./physicalTopologyRealtimeModel";
import type { PhysicalTopologyFrame } from "./usePhysicalTopologyDataFrame";

export function mergePhysicalTopologyRealtime(
  frame: PhysicalTopologyFrame,
  measurements: Record<string, LivePodMeasurement>,
): PhysicalTopologyFrame {
  if (frame.phase !== "ready" || Object.keys(measurements).length === 0) return frame;
  return {
    ...frame,
    data: mergePhysicalTopologySnapshot(frame.data, measurements),
  };
}

function mergePhysicalTopologySnapshot(
  topology: PhysicalTopologySnapshot,
  measurements: Record<string, LivePodMeasurement>,
): PhysicalTopologySnapshot {
  let changed = false;
  let latestObservedAt = topology.metricsObservedAt;
  const pods = topology.pods.map((pod) => {
    if (pod.namespace === null) return pod;
    const measurement = measurements[podIdentity(pod.namespace, pod.name)];
    if (measurement === undefined) return pod;
    changed = true;
    latestObservedAt = laterTimestamp(latestObservedAt, measurement.observedAt);
    return mergePod(pod, measurement);
  });
  return changed
    ? { ...topology, pods, metricsObservedAt: latestObservedAt }
    : topology;
}

function mergePod(
  pod: PhysicalTopologyPod,
  measurement: LivePodMeasurement,
): PhysicalTopologyPod {
  return {
    ...pod,
    ...(measurement.usagePercent === undefined
      ? {}
      : { usagePercent: measurement.usagePercent }),
    ...(measurement.cpuMillicores === undefined
      ? {}
      : { cpuMillicores: measurement.cpuMillicores }),
    ...(measurement.memoryMebibytes === undefined
      ? {}
      : { memoryMebibytes: measurement.memoryMebibytes }),
    ...(measurement.phase === undefined ? {} : { phase: measurement.phase }),
    ...(measurement.health === undefined ? {} : { health: measurement.health }),
    ...(measurement.restartCount === undefined
      ? {}
      : { restartCount: measurement.restartCount }),
  };
}

function laterTimestamp(
  current: string | null,
  candidate: string | null | undefined,
): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return Date.parse(candidate) >= Date.parse(current) ? candidate : current;
}
