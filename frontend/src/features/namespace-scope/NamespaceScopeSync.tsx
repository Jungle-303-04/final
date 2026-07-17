import { useEffect, useMemo, useRef, useState } from "react";
import {
  ShellStatePortFailure,
  type NamespaceScopeRecord,
  type ShellStatePort,
} from "../shell-state/shellStateContract";
import { useBottomDock } from "../bottom-dock/BottomDockProvider";
import { useClusterScope } from "../cluster-scope/ClusterScopeProvider";
import { useUnifiedFilter } from "../filters/UnifiedFilterProvider";
import { publishNamespaceScopeInvalidation } from "./namespaceScopeInvalidation";

/**
 * Keeps one user's authoritative namespace replacement scope aligned with the
 * URL model. Successful rescope closes incompatible live browser streams.
 */
export function NamespaceScopeSync({ port }: { port: ShellStatePort }) {
  const clusterScope = useClusterScope();
  const filter = useUnifiedFilter();
  const dock = useBottomDock();
  const clusterId = clusterScope.selectedCluster?.id ?? null;
  const [record, setRecord] = useState<NamespaceScopeRecord | null>(null);
  const hydratedCluster = useRef<string | null>(null);
  const selectedNamespaces = useMemo(() => clusterId === null
    ? []
    : filter.state.common.namespaces
        .filter((item) => item.clusterId === clusterId)
        .map((item) => item.namespace)
        .sort(), [clusterId, filter.state.common.namespaces]);
  const selectionKey = selectedNamespaces.join("\u0000");

  useEffect(() => {
    if (clusterId === null) {
      hydratedCluster.current = null;
      queueMicrotask(() => setRecord(null));
      return;
    }
    const controller = new AbortController();
    let active = true;
    void port.getNamespaceScope(clusterId, controller.signal).then((scope) => {
      if (!active) return;
      setRecord(scope);
      hydratedCluster.current = clusterId;
      if (selectedNamespaces.length === 0 && scope.activeNamespaces.length > 0) {
        filter.updateFilters((current) => ({
          ...current,
          common: {
            ...current.common,
            namespaces: [
              ...current.common.namespaces.filter((item) => item.clusterId !== clusterId),
              ...scope.activeNamespaces.map((namespace) => ({ clusterId, namespace })),
            ],
          },
        }), "legacy-migration");
      }
    }, () => {
      if (active) setRecord(null);
    });
    return () => {
      active = false;
      controller.abort();
    };
    // The URL selection is intentionally read only during server hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId, port]);

  useEffect(() => {
    if (
      clusterId === null ||
      record === null ||
      record.clusterId !== clusterId ||
      hydratedCluster.current !== clusterId
    ) return;
    const currentKey = [...record.activeNamespaces].sort().join("\u0000");
    if (currentKey === selectionKey) return;
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      void port.updateNamespaceScope({
        clusterId,
        namespaces: selectedNamespaces,
        expectedRevision: record.revision,
      }, controller.signal).then((next) => {
        if (!active) return;
        setRecord(next);
        dock.invalidateNamespaceScope(clusterId, next.activeNamespaces);
        publishNamespaceScopeInvalidation({
          clusterId,
          allowedNamespaces: next.activeNamespaces,
        });
      }, (error: unknown) => {
        if (!active) return;
        if (error instanceof ShellStatePortFailure && error.code === "conflict") {
          void port.getNamespaceScope(clusterId, controller.signal).then((next) => {
            if (active) setRecord(next);
          });
        }
      });
    }, 150);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [clusterId, dock, port, record, selectedNamespaces, selectionKey]);

  return null;
}
