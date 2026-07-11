import { useEffect, useState } from "react";
import { ApiError, listClusters, type ClusterSummary } from "../../api";
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
  | { status: "ready"; clusters: ClusterSummary[] }
  | { status: "error"; error: ApiError };

export type UsageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; value: ClusterUsageResponse; refreshing: boolean }
  | { status: "error"; error: ApiError };

export interface LiveMetricsState {
  connection: RealtimeConnectionState | null;
  summary: LiveSummary | null;
}

export function useClusterList(): ClusterListState {
  const [state, setState] = useState<ClusterListState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(async () => {
      try {
        const response = await listClusters({}, controller.signal);
        setState({ status: "ready", clusters: response.clusters });
      } catch (error) {
        if (!controller.signal.aborted) setState({ status: "error", error: asApiError(error) });
      }
    });
    return () => controller.abort();
  }, []);

  return state;
}

export function useClusterUsage(clusterId: string | null): UsageState {
  const [state, setState] = useState<UsageState>({ status: "idle" });

  useEffect(() => {
    if (clusterId === null) return;
    const activeClusterId = clusterId;
    const controller = new AbortController();
    let active = true;

    async function load(background: boolean) {
      if (!active) return;
      setState((current) => background && current.status === "ready"
        ? { ...current, refreshing: true }
        : { status: "loading" });
      try {
        const value = await getClusterUsage(activeClusterId, {}, controller.signal);
        setState({ status: "ready", value, refreshing: false });
      } catch (error) {
        if (!controller.signal.aborted) setState({ status: "error", error: asApiError(error) });
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

  return state;
}

export function useLiveMetrics(
  workspaceId: string,
  clusterId: string | null,
): LiveMetricsState {
  const [state, setState] = useState<LiveMetricsState>({ connection: null, summary: null });

  useEffect(() => {
    if (clusterId === null) return;
    let client: RealtimeClient | null = null;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      client = connectRealtime({
        subscription: { workspaceId, clusterId },
        onMessage(message) {
          if (message.type === "live.summary" && message.cluster_id === clusterId) {
            setState((current) => ({ ...current, summary: message.summary }));
          }
        },
        onStateChange(connection) {
          setState((current) => ({ ...current, connection }));
        },
      });
    });
    return () => {
      active = false;
      client?.close();
    };
  }, [clusterId, workspaceId]);

  return state;
}

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError("network", "메트릭 데이터 경로를 확인할 수 없습니다.", { cause: error });
}
