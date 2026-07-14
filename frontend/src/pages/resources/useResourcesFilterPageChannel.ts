import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { ResourcesFilterSnapshot } from "../../features/resources/resourcesFilterContract";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";
import { isAbortError, toResourcesFailure } from "./resourcesPageStateModel";
import {
  FILTER_PAGE_IDLE,
  FILTER_PAGE_LOADING,
  appendFilterPage,
  failFilterPageRequest,
  replaceFilterPage,
  startFilterPageRequest,
  type ResourcesFilterPageState,
  type ResourcesFilterRequestMode,
} from "./resourcesFilterPageStateModel";

interface PageableData {
  hasMore: boolean;
  nextCursor: string | null;
  snapshot: ResourcesFilterSnapshot;
}

interface FilterPageChannelInput<T extends PageableData> {
  active: boolean;
  channel: string;
  load: (cursor: string | undefined, signal: AbortSignal) => Promise<T>;
  merge: (accepted: T, incoming: T) => T;
  owner: object;
  reportUnauthorized: () => void;
  revision: number;
  scope: string | null;
}

interface ScopedPage<T> {
  scope: string | null;
  state: ResourcesFilterPageState<T>;
}

interface AppendRequest {
  cursor: string;
  lifetime: object;
  nonce: number;
}

export function useResourcesFilterPageChannel<T extends PageableData>(
  input: FilterPageChannelInput<T>,
) {
  const {
    active,
    channel,
    load,
    merge,
    owner,
    reportUnauthorized,
    revision,
    scope,
  } = input;
  const [record, setRecord] = useState<ScopedPage<T>>({
    scope: null,
    state: FILTER_PAGE_IDLE,
  });
  const [appendRequest, setAppendRequest] = useState<AppendRequest | null>(null);
  const lifetime = useMemo(
    () => ({ active, owner, revision, scope }),
    [active, owner, revision, scope],
  );
  const append = appendRequest?.lifetime === lifetime
    ? appendRequest
    : null;
  const reportUnauthorizedEvent = useEffectEvent(reportUnauthorized);
  const mode: ResourcesFilterRequestMode = append === null ? "replace" : "append";
  const cursor = append?.cursor;
  const nonce = append?.nonce ?? 0;

  useEffect(() => {
    if (!active || scope === null) return;
    let requestActive = true;
    queueRequestStart(setRecord, scope, mode, () => requestActive);
    const request = acquireSharedRequest(
      owner,
      [channel, scope, cursor ?? "first", revision, nonce].join(":"),
      (signal) => load(cursor, signal),
    );
    void request.promise.then(
      (page) => {
        if (!requestActive) return;
        setRecord((current) => {
          if (current.scope !== scope) return current;
          return {
            scope,
            state: mode === "append"
              ? appendFilterPage(current.state, page, merge)
              : replaceFilterPage(page),
          };
        });
      },
      (error: unknown) => {
        if (!requestActive || isAbortError(error)) return;
        const failure = toResourcesFailure(error);
        if (failure.code === "unauthorized") {
          reportUnauthorizedEvent();
          return;
        }
        setRecord((current) => current.scope === scope
          ? { scope, state: failFilterPageRequest(current.state, mode, failure) }
          : current);
      },
    );
    return () => {
      requestActive = false;
      request.release();
    };
  }, [
    active, channel, cursor, load, merge, mode, nonce, owner, revision, scope,
  ]);

  const state = !active || scope === null
    ? filterPageIdle<T>()
    : record.scope === scope ? record.state : filterPageLoading<T>();
  const loadMore = useCallback(() => {
    if (scope === null || state.phase !== "ready" || state.data === null ||
      state.refreshing || state.appending || !state.data.hasMore ||
      state.data.nextCursor === null) return;
    setAppendRequest((current) => ({
      cursor: state.data!.nextCursor!,
      lifetime,
      nonce: (current?.nonce ?? 0) + 1,
    }));
  }, [lifetime, scope, state]);
  return { loadMore, state };
}

function queueRequestStart<T>(
  setRecord: Dispatch<SetStateAction<ScopedPage<T>>>,
  scope: string,
  mode: ResourcesFilterRequestMode,
  active: () => boolean,
) {
  queueMicrotask(() => {
    if (!active()) return;
    setRecord((current) => ({
      scope,
      state: current.scope === scope
        ? startFilterPageRequest(current.state, mode)
        : filterPageLoading<T>(),
    }));
  });
}

function filterPageIdle<T>(): ResourcesFilterPageState<T> {
  return FILTER_PAGE_IDLE;
}

function filterPageLoading<T>(): ResourcesFilterPageState<T> {
  return FILTER_PAGE_LOADING;
}
