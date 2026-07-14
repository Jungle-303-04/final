import {
  createEmptyProductDetailQuery,
  createEmptyUnifiedFilterState,
} from "./filterContract";
import { serializeProductFilterUrl } from "./filterUrl";

export interface AlertResourceSubject {
  cluster: string;
  namespace: string | null;
  kind: string;
  name: string;
}

export function alertEventResourceHref(subject: AlertResourceSubject): string {
  const state = createEmptyUnifiedFilterState();
  state.common.clusters = [subject.cluster];
  state.resources.types = [resourceTypeForKind(subject.kind)];
  const detail = createEmptyProductDetailQuery();
  detail.detail = [subject.kind, subject.namespace ?? "~", subject.name].join("/");
  return `/resources${serializeProductFilterUrl(state, detail)}`;
}

function resourceTypeForKind(kind: string): string {
  const known: Record<string, string> = {
    ConfigMap: "config_map",
    CronJob: "cron_job",
    DaemonSet: "daemon_set",
    Deployment: "deployment",
    Event: "event",
    Job: "job",
    Node: "node",
    Pod: "pod",
    ReplicaSet: "replica_set",
    Secret: "secret",
    Service: "service",
    StatefulSet: "stateful_set",
  };
  return known[kind] ?? kind.toLowerCase();
}
