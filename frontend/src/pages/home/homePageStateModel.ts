import {
  HomePortFailure,
  type HomeClusterOverview,
  type HomeInsights,
  type HomeNodeCollection,
  type HomePodCollection,
} from "../../features/home/homeContract";
import {
  ASYNC_IDLE,
  ASYNC_LOADING,
  asyncResourceFailure,
  asyncResourceSuccess,
  isAbortError as isSharedAbortError,
  startAsyncResource,
  type AsyncResourceState,
} from "../../shared/data/asyncResourceState";

export type HomeResourceState<T> = AsyncResourceState<T, HomePortFailure>;

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
  insights: HomeResourceState<HomeInsights>;
  nodes: HomeResourceState<HomeNodeCollection>;
  podKey: string | null;
  pods: HomeResourceState<HomePodCollection>;
}

export const HOME_IDLE = ASYNC_IDLE;
export const HOME_LOADING = ASYNC_LOADING;
export const HOME_ALLOWED = { kind: "allowed", failure: null } as const;

export const EMPTY_HOME_FRAME: HomeClusterFrame = {
  scopeKey: null,
  revision: 0,
  clusterAccess: HOME_ALLOWED,
  overview: HOME_IDLE,
  insights: HOME_IDLE,
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
    insights: preserve ? previous.insights : HOME_LOADING,
    nodes: preserve ? startResource(previous.nodes) : HOME_LOADING,
    podKey: preserve ? previous.podKey : null,
    pods: preserve && previous.podKey ? startResource(previous.pods) : HOME_IDLE,
  };
}

export function startResource<T>(state: HomeResourceState<T>): HomeResourceState<T> {
  return startAsyncResource(state);
}

export function resourceSuccess<T>(data: T): HomeResourceState<T> {
  return asyncResourceSuccess(data);
}

export function resourceFailure<T>(
  current: HomeResourceState<T>,
  failure: HomePortFailure,
): HomeResourceState<T> {
  return asyncResourceFailure(current, failure);
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
    insights: denied,
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
  return isSharedAbortError(error);
}
