import { useCallback, useEffect, useState } from "react";

import type {
  TopologyHierarchyGateway,
  TopologyHierarchySnapshot,
} from "../contracts";

export type TopologyHierarchyState =
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly snapshot: TopologyHierarchySnapshot;
      readonly refreshing: boolean;
      readonly refreshError: Error | null;
    }
  | { readonly status: "error"; readonly error: Error };

export function useTopologyHierarchy(gateway: TopologyHierarchyGateway) {
  const [requestRevision, setRequestRevision] = useState(0);
  const [state, setState] = useState<TopologyHierarchyState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setState((current) =>
      current.status === "ready"
        ? { ...current, refreshing: true, refreshError: null }
        : { status: "loading" },
    );

    void gateway
      .getSnapshot(controller.signal)
      .then((snapshot) => {
        if (!active) return;
        setState({ status: "ready", snapshot, refreshing: false, refreshError: null });
      })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;
        const error = reason instanceof Error ? reason : new Error("Topology snapshot request failed");
        setState((current) =>
          current.status === "ready"
            ? { ...current, refreshing: false, refreshError: error }
            : { status: "error", error },
        );
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [gateway, requestRevision]);

  const refresh = useCallback(() => setRequestRevision((value) => value + 1), []);

  return { state, refresh };
}
