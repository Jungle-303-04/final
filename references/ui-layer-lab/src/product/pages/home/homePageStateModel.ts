import {
  HomePortFailure,
  type HomeClusterOverview,
  type HomeNodeCollection,
  type HomePodCollection,
} from "../../features/home/homeContract";

export type HomeResourceState<T> =
  | { phase: "idle"; data: null; failure: null }
  | { phase: "loading"; data: null; failure: null }
  | {
    phase: "ready";
    data: T;
    failure: null;
    refreshing: boolean;
    refreshFailure: HomePortFailure | null;
  }
  | { phase: "failed"; data: null; failure: HomePortFailure };

export type HomeClusterAccess =
  | { kind: "allowed"; failure: null }
  | { kind: "forbidden"; failure: HomePortFailure };

export type HomeSelectedNodeResolution =
  | "none"
  | "invalid"
  | "resolving"
  | "known"
  | "unknown";

export interface HomeClusterFrame {
  scopeKey: string | null;
  revision: number;
  clusterAccess: HomeClusterAccess;
  overview: HomeResourceState<HomeClusterOverview>;
  nodes: HomeResourceState<HomeNodeCollection>;
  podKey: string | null;
  pods: HomeResourceState<HomePodCollection>;
}

export const HOME_IDLE = { phase: "idle", data: null, failure: null } as const;
export const HOME_LOADING = { phase: "loading", data: null, failure: null } as const;
export const HOME_ALLOWED = { kind: "allowed", failure: null } as const;

export const EMPTY_HOME_FRAME: HomeClusterFrame = {
  scopeKey: null,
  revision: 0,
  clusterAccess: HOME_ALLOWED,
  overview: HOME_IDLE,
  nodes: HOME_IDLE,
  podKey: null,
  pods: HOME_IDLE,
};

export function startClusterFrame(
  previous: HomeClusterFrame,
  scopeKey: string,
  revision: number,
): HomeClusterFrame {
  const preserve = previous.scopeKey === scopeKey && previous.clusterAccess.kind === "allowed";
  return {
    scopeKey,
    revision,
    clusterAccess: HOME_ALLOWED,
    overview: preserve ? startResource(previous.overview) : HOME_LOADING,
    nodes: preserve ? startResource(previous.nodes) : HOME_LOADING,
    podKey: preserve ? previous.podKey : null,
    pods: preserve && previous.podKey ? startResource(previous.pods) : HOME_IDLE,
  };
}

export function startResource<T>(state: HomeResourceState<T>): HomeResourceState<T> {
  if (state.phase !== "ready") return HOME_LOADING;
  return { ...state, refreshing: true, refreshFailure: null };
}

export function resourceSuccess<T>(data: T): HomeResourceState<T> {
  return { phase: "ready", data, failure: null, refreshing: false, refreshFailure: null };
}

export function resourceFailure<T>(
  current: HomeResourceState<T>,
  failure: HomePortFailure,
): HomeResourceState<T> {
  if (current.phase !== "ready") return { phase: "failed", data: null, failure };
  return { ...current, refreshing: false, refreshFailure: failure };
}

export function forbidClusterFrame(
  current: HomeClusterFrame,
  failure: HomePortFailure,
): HomeClusterFrame {
  const denied = { phase: "failed", data: null, failure } as const;
  return {
    ...current,
    clusterAccess: { kind: "forbidden", failure },
    overview: denied,
    nodes: denied,
    podKey: null,
    pods: denied,
  };
}

export function isCurrentFrame(
  frame: HomeClusterFrame,
  scopeKey: string,
  revision: number,
): boolean {
  return frame.scopeKey === scopeKey && frame.revision === revision &&
    frame.clusterAccess.kind === "allowed";
}

const NODE_NAME = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/u;

export function isValidNodeName(value: string): boolean {
  return value.length <= 253 && NODE_NAME.test(value);
}

export function toHomeFailure(error: unknown): HomePortFailure {
  return error instanceof HomePortFailure ? error : new HomePortFailure("error");
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
