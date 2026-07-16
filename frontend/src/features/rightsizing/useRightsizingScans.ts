import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  RightsizingPort,
  RightsizingPortFailure,
  RightsizingScan,
} from "./rightsizingContract";

export interface RightsizingClusterScope {
  clusterId: string;
  namespaces: readonly string[];
}

export type RightsizingScanFrame =
  | { phase: "idle"; scans: readonly []; failures: readonly [] }
  | { phase: "loading"; scans: readonly RightsizingScan[]; failures: readonly RightsizingScopeFailure[] }
  | { phase: "failed"; scans: readonly []; failures: readonly RightsizingScopeFailure[] }
  | { phase: "ready"; scans: readonly RightsizingScan[]; failures: readonly RightsizingScopeFailure[] };

export interface RightsizingScopeFailure {
  clusterId: string;
  failure: RightsizingPortFailure | Error;
}

const RIGHTSIZING_SCOPE_CONCURRENCY = 4;

export function useRightsizingScans(
  port: RightsizingPort,
  scopes: readonly RightsizingClusterScope[],
): {
  frame: RightsizingScanFrame;
  run: () => Promise<void>;
} {
  const canonicalScopes = useMemo(() => scopes.map((scope) => ({
    clusterId: scope.clusterId,
    namespaces: [...new Set(scope.namespaces)].sort(),
  })).sort((left, right) => left.clusterId.localeCompare(right.clusterId)), [scopes]);
  const scopeKey = useMemo(() => canonicalScopes.map((scope) =>
    `${scope.clusterId}\u0000${scope.namespaces.join("\u0001")}`).join("\u0002"), [canonicalScopes]);
  const [record, setRecord] = useState<{ scopeKey: string; frame: RightsizingScanFrame }>({
    scopeKey,
    frame: { phase: "idle", scans: [], failures: [] },
  });
  const activeRequest = useRef<AbortController | null>(null);
  const frame = record.scopeKey === scopeKey
    ? record.frame
    : { phase: "idle", scans: [], failures: [] } satisfies RightsizingScanFrame;

  useEffect(() => () => activeRequest.current?.abort(), []);

  const run = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setRecord((current) => {
      const previous = current.scopeKey === scopeKey ? current.frame : null;
      return {
        scopeKey,
        frame: {
          phase: "loading",
          scans: previous?.scans ?? [],
          failures: [],
        },
      };
    });

    const outcomes = await boundedMap(
      canonicalScopes,
      RIGHTSIZING_SCOPE_CONCURRENCY,
      async (scope) => {
        try {
          return {
            ok: true as const,
            scan: await port.getScan({
              clusterId: scope.clusterId,
              namespaces: scope.namespaces,
              limit: 200,
            }, controller.signal),
          };
        } catch (error) {
          if (isAbortError(error)) throw error;
          return {
            ok: false as const,
            failure: {
              clusterId: scope.clusterId,
              failure: error instanceof Error ? error : new Error("Rightsizing scan failed"),
            },
          };
        }
      },
    ).catch((error: unknown) => {
      if (isAbortError(error)) return null;
      throw error;
    });
    if (outcomes === null || controller.signal.aborted || activeRequest.current !== controller) return;

    const scans = outcomes.flatMap((outcome) => outcome.ok ? [outcome.scan] : []);
    const failures = outcomes.flatMap((outcome) => outcome.ok ? [] : [outcome.failure]);
    setRecord((current) => {
      if (current.scopeKey !== scopeKey) return current;
      const previousScans = new Map(current.frame.scans.map((scan) => [scan.scope.clusterId, scan]));
      for (const scan of scans) previousScans.set(scan.scope.clusterId, scan);
      const mergedScans = canonicalScopes.flatMap((scope) => {
        const scan = previousScans.get(scope.clusterId);
        return scan ? [scan] : [];
      });
      return {
        scopeKey,
        frame: mergedScans.length === 0
          ? { phase: "failed", scans: [], failures }
          : { phase: "ready", scans: mergedScans, failures },
      };
    });
  }, [canonicalScopes, port, scopeKey]);

  return { frame, run };
}

async function boundedMap<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const worker = async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await operation(values[index]!);
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(concurrency, values.length) },
    () => worker(),
  ));
  return results;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
