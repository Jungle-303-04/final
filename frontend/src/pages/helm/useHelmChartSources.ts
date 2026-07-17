import { useCallback, useEffect, useRef, useState } from "react";

import {
  type HelmChartSource,
  type HelmPort,
  HelmPortFailure,
} from "../../features/helm/helmContract";
import { isAbortError, toHelmFailure } from "./helmChartSourceUi";

export type HelmChartSourceListState =
  | { phase: "loading" }
  | { phase: "failed"; failure: HelmPortFailure }
  | {
    phase: "ready";
    items: readonly HelmChartSource[];
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
    refreshing: boolean;
    loadingMore: boolean;
    loadMoreFailure: HelmPortFailure | null;
  };

export function useHelmChartSources(port: HelmPort) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<HelmChartSourceListState>({ phase: "loading" });
  const loadMoreRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setState((current) => current.phase === "ready"
        ? { ...current, refreshing: true, loadMoreFailure: null }
        : { phase: "loading" });
    });
    void port.listChartSources({}, controller.signal).then(
      (page) => {
        if (!active) return;
        setState({
          phase: "ready",
          items: page.items,
          limit: page.limit,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
          refreshing: false,
          loadingMore: false,
          loadMoreFailure: null,
        });
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        setState({ phase: "failed", failure: toHelmFailure(error) });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [port, revision]);

  useEffect(() => () => loadMoreRequestRef.current?.abort(), []);

  const refresh = useCallback(() => setRevision((current) => current + 1), []);
  const loadMore = useCallback(() => {
    if (state.phase !== "ready" || state.loadingMore || !state.hasMore || state.nextCursor === null) return;
    const cursor = state.nextCursor;
    const limit = state.limit;
    const controller = new AbortController();
    loadMoreRequestRef.current?.abort();
    loadMoreRequestRef.current = controller;
    setState((current) => current.phase === "ready"
      ? { ...current, loadingMore: true, loadMoreFailure: null }
      : current);
    void port.listChartSources({ cursor, limit }, controller.signal).then(
      (page) => {
        if (controller.signal.aborted) return;
        setState((current) => current.phase === "ready" ? {
          ...current,
          items: mergeSources(current.items, page.items),
          limit: page.limit,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
          loadingMore: false,
          loadMoreFailure: null,
        } : current);
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setState((current) => current.phase === "ready"
          ? { ...current, loadingMore: false, loadMoreFailure: toHelmFailure(error) }
          : current);
      },
    );
  }, [port, state]);

  return { state, refresh, loadMore };
}

function mergeSources(
  current: readonly HelmChartSource[],
  incoming: readonly HelmChartSource[],
): readonly HelmChartSource[] {
  const merged = new Map(current.map((source) => [source.id, source]));
  for (const source of incoming) merged.set(source.id, source);
  return [...merged.values()];
}
