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
) {
  const load = useCallback(
    (signal: AbortSignal) => applicationId === null
      ? Promise.resolve(null)
      : port.getApplication(applicationId, signal),
    [applicationId, port],
  );
  return useApplicationsResource<ApplicationDetailModel | null>(
    port,
    applicationId === null ? null : `applications:detail:${applicationId}`,
    load,
  );
}

export function useApplicationDeployments(
  port: ApplicationsPort,
  applicationId: string | null,
  active: boolean,
) {
  const load = useCallback(
    (signal: AbortSignal) => applicationId === null
      ? Promise.resolve(null)
      : port.listDeployments(applicationId, signal),
    [applicationId, port],
  );
  return useApplicationsResource<readonly ApplicationDeploymentModel[] | null>(
    port,
    applicationId === null || !active ? null : `applications:deployments:${applicationId}`,
    load,
  );
}

export function useApplicationDrift(
  port: ApplicationsPort,
  applicationId: string | null,
  active: boolean,
) {
  const load = useCallback(
    (signal: AbortSignal) => applicationId === null
      ? Promise.resolve(null)
      : port.getDrift(applicationId, signal),
    [applicationId, port],
  );
  return useApplicationsResource<ApplicationDriftModel | null>(
    port,
    applicationId === null || !active ? null : `applications:drift:${applicationId}`,
    load,
  );
}

function useApplicationsResource<T>(
  owner: ApplicationsPort,
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
): readonly [ApplicationsResource<T>, () => void] {
  const [revision, refresh] = useReducer((value: number) => value + 1, 0);
  const [record, setRecord] = useState<{
    key: string | null;
    state: ApplicationsResource<T>;
  }>({ key: null, state: { phase: "loading" } });
  const state: ApplicationsResource<T> = key === null
    ? { phase: "ready", data: null as T, refreshing: false }
    : record.key === key
      ? record.state
      : { phase: "loading" };

  useEffect(() => {
    if (key === null) return;
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
  }, [key, load, owner, revision]);

  return [state, refresh] as const;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
