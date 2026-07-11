import { useEffect, useState } from "react";
import { ApiError, listClusters } from "../../api";
import { getClusterUsage } from "../../api/metrics";
import type { ClusterUsageResponse } from "../../api/metrics-schemas";
import {
  connectRealtime,
  type RealtimeClient,
  type RealtimeConnectionState,
} from "../../api/live";
import type { LiveSummary } from "../../api/live-schemas";

const USAGE_REFRESH_INTERVAL_MS = 30_000;

export type ClusterListState =
  | { status: "loading" }
  | { status: "ready"; clusters: MetricClusterOption[] }
  | { status: "error"; error: ApiError };

export interface MetricClusterOption {
  clusterId: string;
  name: string;
  status: string;
  connectionStatus: string;
}

export type UsageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; value: ClusterUsageResponse; refreshing: boolean }
  | { status: "error"; error: ApiError };

export interface LiveMetricsState {
  connection: RealtimeConnectionState | null;
  summary: LiveSummary | null;
}

interface ScopedUsageState {
  clusterId: string | null;
  value: UsageState;
}

interface ScopedLiveState {
  clusterId: string | null;
  value: LiveMetricsState;
}

export function useClusterList(): ClusterListState {
  const [state, setState] = useState<ClusterListState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(async () => {
      try {
        const response = await listClusters({}, controller.signal);
        setState({
          status: "ready",
          clusters: response.clusters.map((cluster) => ({
            clusterId: cluster.cluster_id,
            name: cluster.name,
            status: cluster.status,
            connectionStatus: cluster.connection_status,
          })),
        });
      } catch (error) {
        if (!controller.signal.aborted) setState({ status: "error", error: asApiError(error) });
      }
    });
    return () => controller.abort();
  }, []);

  return state;
}

export function useClusterUsage(clusterId: string | null): UsageState {
  const [scopedState, setScopedState] = useState<ScopedUsageState>({
    clusterId: null,
    value: { status: "idle" },
  });

  useEffect(() => {
    if (clusterId === null) return;
    const activeClusterId = clusterId;
    const controller = new AbortController();
    let active = true;

    async function load(background: boolean) {
      if (!active) return;
      setScopedState((current) => ({
        clusterId: activeClusterId,
        value: background && current.clusterId === activeClusterId && current.value.status === "ready"
          ? { ...current.value, refreshing: true }
          : { status: "loading" },
      }));
      try {
        const value = await getClusterUsage(activeClusterId, {}, controller.signal);
        setScopedState({
          clusterId: activeClusterId,
          value: { status: "ready", value, refreshing: false },
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          setScopedState({
            clusterId: activeClusterId,
            value: { status: "error", error: asApiError(error) },
          });
        }
      }
    }

    queueMicrotask(() => void load(false));
    const intervalId = window.setInterval(() => void load(true), USAGE_REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [clusterId]);

  if (scopedState.clusterId === clusterId) return scopedState.value;
  return clusterId === null ? { status: "idle" } : { status: "loading" };
}

export function useLiveMetrics(
  workspaceId: string,
  clusterId: string | null,
): LiveMetricsState {
  const [scopedState, setScopedState] = useState<ScopedLiveState>({
    clusterId: null,
    value: { connection: null, summary: null },
  });

  useEffect(() => {
    if (clusterId === null) return;
    const activeClusterId = clusterId;
    let client: RealtimeClient | null = null;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      client = connectRealtime({
        subscription: { workspaceId, clusterId: activeClusterId },
        onMessage(message) {
          if (message.type === "live.summary" && message.cluster_id === activeClusterId) {
            setScopedState((current) => ({
              clusterId: activeClusterId,
              value: {
                connection: current.clusterId === activeClusterId
                  ? current.value.connection
                  : null,
                summary: message.summary,
              },
            }));
          }
        },
        onStateChange(connection) {
          setScopedState((current) => ({
            clusterId: activeClusterId,
            value: {
              connection,
              summary: current.clusterId === activeClusterId ? current.value.summary : null,
            },
          }));
        },
      });
    });
    return () => {
      active = false;
      client?.close();
    };
  }, [clusterId, workspaceId]);

  return scopedState.clusterId === clusterId
    ? scopedState.value
    : { connection: null, summary: null };
}

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError("network", "메트릭 데이터 경로를 확인할 수 없습니다.", { cause: error });
}
