import { useEffect, useState } from "react";

import { getChecksOverview } from "../api/checks";

// UI-PHASE2-001 §5.2: typed live adapter for the Checks surface. Reads
// `GET /api/checks/overview`. The current dev contract reports check
// results/catalog/visibility as `unavailable` with reason codes while still
// exposing real per-cluster scope coverage. Unsupported checks render as
// unavailable — never as "passing".

export type ChecksFeedStatus = "loading" | "ready" | "error";

export interface ChecksScopeView {
  clusterId: string;
  namespaces: string[];
  freshness: string;
}

export interface ChecksOverviewView {
  status: ChecksFeedStatus;
  scopeAvailability: string | null;
  resultAvailability: string | null;
  catalogAvailability: string | null;
  reasonCodes: string[];
  scopes: ChecksScopeView[];
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

export function useChecksOverview(): ChecksOverviewView {
  const [view, setView] = useState<ChecksOverviewView>({
    status: "loading",
    scopeAvailability: null,
    resultAvailability: null,
    catalogAvailability: null,
    reasonCodes: [],
    scopes: [],
  });
  useEffect(() => {
    const controller = new AbortController();
    void getChecksOverview({}, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setView({
          status: "ready",
          scopeAvailability: response.scope_coverage.availability,
          resultAvailability: response.result_set.availability,
          catalogAvailability: response.catalog.availability,
          reasonCodes: [...response.result_set.reason_codes],
          scopes: response.scope_coverage.scopes.map((scope) => ({
            clusterId: scope.cluster_id,
            namespaces: [...scope.namespaces],
            freshness: scope.freshness,
          })),
        });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setView((prev) => ({ ...prev, status: "error" }));
      });
    return () => controller.abort();
  }, []);
  return view;
}
