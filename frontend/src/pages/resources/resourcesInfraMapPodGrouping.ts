import type { InfraMapPod } from "./resourcesInfraMapModel";

export interface InfraMapPodReplicaGroup {
  evidence: InfraMapPodReplicaGroupEvidence;
  key: string;
  kind: string | null;
  label: string;
  pods: InfraMapPod[];
}

export type InfraMapPodReplicaGroupEvidence =
  | "owner"
  | "replicaGroup"
  | "singleton"
  | "workload";

export function groupInfraMapPodsByReplica(
  pods: readonly InfraMapPod[],
): InfraMapPodReplicaGroup[] {
  const groups = new Map<string, InfraMapPodReplicaGroup>();
  for (const pod of pods) {
    const group = infraMapPodReplicaGroup(pod);
    const current = groups.get(group.key);
    if (current) {
      current.pods.push(pod);
      continue;
    }
    groups.set(group.key, {
      evidence: group.evidence,
      key: group.key,
      kind: group.kind,
      label: group.label,
      pods: [pod],
    });
  }
  return [...groups.values()];
}

export function infraMapPodReplicaGroup(pod: InfraMapPod): {
  evidence: InfraMapPodReplicaGroupEvidence;
  key: string;
  kind: string | null;
  label: string;
} {
  if (pod.replicaGroupKey) {
    return {
      evidence: "replicaGroup",
      key: pod.replicaGroupKey,
      kind: pod.replicaGroupKind,
      label: groupLabel(pod.replicaGroupKind, pod.replicaGroupName, pod.replicaGroupKey),
    };
  }
  if (pod.workloadKey) {
    return {
      evidence: "workload",
      key: pod.workloadKey,
      kind: pod.ownerKind,
      label: groupLabel(pod.ownerKind, pod.ownerName, pod.workloadKey),
    };
  }
  if (pod.ownerUid) {
    return {
      evidence: "owner",
      key: `owner:${pod.ownerUid}`,
      kind: pod.ownerKind,
      label: groupLabel(pod.ownerKind, pod.ownerName, pod.ownerUid),
    };
  }
  return {
    evidence: "singleton",
    key: `singleton:${pod.id}`,
    kind: null,
    label: pod.name,
  };
}

function groupLabel(
  kind: string | null,
  name: string | null,
  fallback: string,
): string {
  if (kind && name) return `${kind} / ${name}`;
  if (name) return name;
  return fallback;
}
