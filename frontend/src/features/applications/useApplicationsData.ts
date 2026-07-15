import { useCallback, useEffect, useReducer, useState } from "react";
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

export type ApplicationsResource<T> =
  | { phase: "loading" }
  | { phase: "ready"; data: T; refreshing: boolean }
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
  options: { reuseReady?: (data: T) => boolean } = {},
): readonly [ApplicationsResource<T>, () => void] {
  const [revision, refresh] = useReducer((value: number) => value + 1, 0);
  const [record, setRecord] = useState<{
    key: string | null;
    state: ApplicationsResource<T>;
  }>({ key: null, state: { phase: "loading" } });
  const reusable = key !== null && record.key !== key &&
    record.state.phase === "ready" && !record.state.refreshing &&
    options.reuseReady?.(record.state.data) === true;
  const state: ApplicationsResource<T> = key === null
    ? { phase: "ready", data: null as T, refreshing: false }
    : record.key === key
      ? record.state
      : reusable
        ? record.state
      : { phase: "loading" };

  useEffect(() => {
    if (key === null || reusable) return;
    const request = acquireSharedRequest(owner, `${key}:${revision}`, load);
    let active = true;
    void request.promise.then(
      (data) => {
        if (active) setRecord({ key, state: { phase: "ready", data, refreshing: false } });
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        setRecord({
          key,
          state: {
            phase: "failed",
            failure: error instanceof ApplicationsFailure
              ? error
              : new ApplicationsFailure("unknown"),
          },
        });
      },
    );
    return () => {
      active = false;
      request.release();
    };
  }, [key, load, owner, reusable, revision]);

  return [state, refresh] as const;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
