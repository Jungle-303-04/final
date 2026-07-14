import { useCallback, useEffect, useReducer, useState } from "react";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";
import {
  ApplicationsGitOpsFailure,
  type ApplicationCatalog,
  type ApplicationsGitOpsPort,
  type GitOpsSnapshot,
} from "./applicationsGitOpsContract";

export type ApplicationsGitOpsResource<T> =
  | { phase: "loading" }
  | { phase: "ready"; data: T; refreshing: boolean }
  | { phase: "failed"; failure: ApplicationsGitOpsFailure };

export function useApplicationsCatalog(port: ApplicationsGitOpsPort) {
  const load = useCallback(
    (signal: AbortSignal) => port.listApplications(signal),
    [port],
  );
  return usePortResource(
    port,
    "applications-gitops:catalog",
    load,
  );
}

export function useGitOpsSnapshot(
  port: ApplicationsGitOpsPort,
  applicationId: string | null,
) {
  const load = useCallback(
    (signal: AbortSignal) => applicationId === null
      ? Promise.resolve(null)
      : port.loadGitOpsSnapshot(applicationId, signal),
    [applicationId, port],
  );
  return usePortResource(
    port,
    applicationId === null ? null : `applications-gitops:snapshot:${applicationId}`,
    load,
  ) as readonly [ApplicationsGitOpsResource<GitOpsSnapshot | null>, () => void];
}

function usePortResource<T>(
  owner: ApplicationsGitOpsPort,
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
): readonly [ApplicationsGitOpsResource<T>, () => void] {
  const [revision, bumpRevision] = useReducer((value: number) => value + 1, 0);
  const [record, setRecord] = useState<{
    key: string | null;
    state: ApplicationsGitOpsResource<T>;
  }>({ key: null, state: { phase: "loading" } });
  const state: ApplicationsGitOpsResource<T> = key === null
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
        if (active) {
          setRecord({
            key,
            state: { phase: "ready", data, refreshing: false },
          });
        }
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        setRecord({
          key,
          state: {
            phase: "failed",
            failure: error instanceof ApplicationsGitOpsFailure
              ? error
              : new ApplicationsGitOpsFailure("unknown"),
          },
        });
      },
    );
    return () => {
      active = false;
      request.release();
    };
  }, [key, load, owner, revision]);

  const refresh = useCallback(() => {
    setRecord((current) => ({
      key,
      state: current.key === key && current.state.phase === "ready"
        ? { ...current.state, refreshing: true }
        : { phase: "loading" },
    }));
    bumpRevision();
  }, [key]);
  return [state, refresh] as const;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}

export type ApplicationsCatalogResource = ApplicationsGitOpsResource<ApplicationCatalog>;
