import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";
import {
  ApplicationsFailure,
  type ApplicationCardModel,
  type ApplicationCatalogFilter,
  type ApplicationDeploymentModel,
  type ApplicationDetailModel,
  type ApplicationDriftModel,
  type ApplicationsPort,
} from "./applicationsContract";

export const APPLICATIONS_REFRESH_INTERVAL_MS = 60_000;

export type ApplicationsResource<T> =
  | { phase: "loading" }
  | {
    phase: "ready";
    data: T;
    refreshing: boolean;
    /** A refresh failed after this data was successfully observed. */
    refreshFailure: ApplicationsFailure | null;
  }
  | { phase: "failed"; failure: ApplicationsFailure };

export function useApplicationCatalog(
  port: ApplicationsPort,
  filter: ApplicationCatalogFilter,
) {
  const filterKey = JSON.stringify(filter);
  const load = useCallback(
    (signal: AbortSignal) => port.listApplications(filter, signal),
    [filter, port],
  );
  return useApplicationsResource<readonly ApplicationCardModel[]>(
    port,
    `applications:catalog:${filterKey}`,
    load,
    { refreshIntervalMs: APPLICATIONS_REFRESH_INTERVAL_MS },
  );
}

export function useApplicationDetail(
  port: ApplicationsPort,
  applicationId: string | null,
  instanceId: string | null,
  workloadKey: string | null,
) {
  const load = useCallback(
    (signal: AbortSignal) => applicationId === null
      ? Promise.resolve(null)
      : instanceId === null
        ? workloadKey === null
          ? port.getApplication(applicationId, signal)
          : port.getApplication(applicationId, signal, undefined, workloadKey)
        : workloadKey === null
          ? port.getApplication(applicationId, signal, instanceId)
          : port.getApplication(applicationId, signal, instanceId, workloadKey),
    [applicationId, instanceId, port, workloadKey],
  );
  return useApplicationsResource<ApplicationDetailModel | null>(
    port,
    applicationId === null ? null : `applications:detail:${applicationId}:${instanceId ?? "default"}:${workloadKey ?? "application"}`,
    load,
    {
      refreshIntervalMs: APPLICATIONS_REFRESH_INTERVAL_MS,
      reuseReady: (data) => data !== null &&
        instanceId !== null &&
        data.scope.selectedInstanceId === instanceId &&
        data.scope.workloadScope.selectedWorkloadKey === workloadKey,
    },
  );
}

export function useApplicationDeployments(
  port: ApplicationsPort,
  applicationId: string | null,
  active: boolean,
  instanceId: string | null,
) {
  const load = useCallback(
    (signal: AbortSignal) => applicationId === null
      ? Promise.resolve(null)
      : instanceId === null
        ? port.listDeployments(applicationId, signal)
        : port.listDeployments(applicationId, signal, instanceId),
    [applicationId, instanceId, port],
  );
  return useApplicationsResource<readonly ApplicationDeploymentModel[] | null>(
    port,
    applicationId === null || !active
      ? null
      : `applications:deployments:${applicationId}:${instanceId ?? "default"}`,
    load,
  );
}

export function useApplicationDrift(
  port: ApplicationsPort,
  applicationId: string | null,
  active: boolean,
  instanceId: string | null,
) {
  const load = useCallback(
    (signal: AbortSignal) => applicationId === null
      ? Promise.resolve(null)
      : instanceId === null
        ? port.getDrift(applicationId, signal)
        : port.getDrift(applicationId, signal, instanceId),
    [applicationId, instanceId, port],
  );
  return useApplicationsResource<ApplicationDriftModel | null>(
    port,
    applicationId === null || !active
      ? null
      : `applications:drift:${applicationId}:${instanceId ?? "default"}`,
    load,
  );
}

function useApplicationsResource<T>(
  owner: ApplicationsPort,
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
  options: {
    refreshIntervalMs?: number;
    reuseReady?: (data: T) => boolean;
  } = {},
): readonly [ApplicationsResource<T>, () => void] {
  const [revision, refresh] = useReducer((value: number) => value + 1, 0);
  const [manualRefresh, setManualRefresh] = useState<{ key: string; token: number } | null>(null);
  const activeRefreshRef = useRef<{ key: string; token: number } | null>(null);
  const nextRefreshTokenRef = useRef(0);
  const [record, setRecord] = useState<{
    key: string | null;
    state: ApplicationsResource<T>;
  }>({ key: null, state: { phase: "loading" } });
  const reusable = key !== null && record.key !== key &&
    record.state.phase === "ready" && !record.state.refreshing &&
    options.reuseReady?.(record.state.data) === true;
  const state: ApplicationsResource<T> = key === null
    ? { phase: "ready", data: null as T, refreshing: false, refreshFailure: null }
    : record.key === key
      ? record.state
      : reusable
        ? record.state
      : { phase: "loading" };
  const clearActiveRefresh = useCallback((requestKey: string, requestToken: number) => {
    if (
      activeRefreshRef.current?.key === requestKey
      && activeRefreshRef.current.token === requestToken
    ) {
      activeRefreshRef.current = null;
    }
  }, []);

  useEffect(() => {
    const activeRefresh = activeRefreshRef.current;
    if (activeRefresh !== null && activeRefresh.key !== key) {
      clearActiveRefresh(activeRefresh.key, activeRefresh.token);
    }
  }, [clearActiveRefresh, key]);

  useEffect(() => {
    if (key === null || reusable) return;
    const request = acquireSharedRequest(owner, `${key}:${revision}`, load);
    const isManualRefresh = manualRefresh?.key === key &&
      activeRefreshRef.current?.key === key &&
      activeRefreshRef.current.token === manualRefresh.token;
    let active = true;
    void request.promise.then(
      (data) => {
        if (!active) return;
        if (isManualRefresh) clearActiveRefresh(key, manualRefresh.token);
        setRecord({
          key,
          state: { phase: "ready", data, refreshing: false, refreshFailure: null },
        });
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        if (isManualRefresh) clearActiveRefresh(key, manualRefresh.token);
        const failure = error instanceof ApplicationsFailure
          ? error
          : new ApplicationsFailure("unknown");
        setRecord((current) => {
          if (current.key === key && current.state.phase === "ready") {
            return {
              key,
              state: {
                ...current.state,
                refreshing: false,
                refreshFailure: failure,
              },
            };
          }
          return { key, state: { phase: "failed", failure } };
        });
      },
    );
    return () => {
      active = false;
      request.release();
      if (isManualRefresh) clearActiveRefresh(key, manualRefresh.token);
    };
  }, [clearActiveRefresh, key, load, manualRefresh, owner, reusable, revision]);

  const requestRefresh = useCallback(() => {
    if (key === null || activeRefreshRef.current?.key === key) return;
    const token = nextRefreshTokenRef.current + 1;
    nextRefreshTokenRef.current = token;
    activeRefreshRef.current = { key, token };
    setManualRefresh({ key, token });
    setRecord((current) => {
      if (current.key !== key || current.state.phase !== "ready") return current;
      return {
        key,
        state: {
          ...current.state,
          refreshing: true,
          refreshFailure: null,
        },
      };
    });
    refresh();
  }, [key, refresh]);

  useEffect(() => {
    if (key === null || options.refreshIntervalMs === undefined) return;
    const refreshVisibleResource = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      requestRefresh();
    };
    const interval = window.setInterval(
      refreshVisibleResource,
      options.refreshIntervalMs,
    );
    const refreshAfterVisibility = () => {
      if (document.visibilityState === "visible") refreshVisibleResource();
    };
    document.addEventListener("visibilitychange", refreshAfterVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshAfterVisibility);
    };
  }, [key, options.refreshIntervalMs, requestRefresh]);

  return [state, requestRefresh] as const;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
