import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import {
  TimelineFailure,
  type TimelineCapabilities,
  type TimelinePort,
} from "../../features/timeline/timelineContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { ScopeFreshness } from "../../shared/parity/referenceParity";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { TimelineSurface } from "./TimelineSurface";

export function createTimelineSurface(port: TimelinePort): ComponentType {
  function TimelineSurfaceRoute() {
    const clusterScope = useClusterScope();
    const filter = useUnifiedFilter();
    const clusters = timelineClusters(clusterScope);
    const scopes = useMemo(() => clusters.map((cluster) => ({
      workspaceId: cluster.workspaceId,
      clusterId: cluster.id,
      namespaces: filter.state.common.namespaces
        .filter((namespace) => namespace.clusterId === cluster.id)
        .map((namespace) => namespace.namespace),
      freshness: timelineFreshness(cluster),
    })), [clusters, filter.state.common.namespaces]);

    const scopeReady = clusterScope.selection.kind !== "resolving"
      && clusterScope.selection.kind !== "empty"
      && clusterScope.selection.kind !== "unavailable"
      && clusterScope.selection.kind !== "unknown"
      && scopes.length > 0;
    const scopeContent = timelineScopeContent(clusterScope);
    const workspaceCacheKey = scopeReady ? scopes[0]?.workspaceId : undefined;

    return (
      <TimelineCapabilityGate
        enabled={scopeReady}
        port={port}
        scopeContent={scopeContent}
        workspaceCacheKey={workspaceCacheKey}
      >
        <TimelineSurface port={port} scopes={scopes} />
      </TimelineCapabilityGate>
    );
  }

  TimelineSurfaceRoute.displayName = "TimelineSurfaceRoute";
  return TimelineSurfaceRoute;
}

type TimelineCapabilityGateState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; capabilities: TimelineCapabilities }
  | { phase: "failed"; failure: TimelineFailure };

interface TimelineCapabilityRecord {
  port: TimelinePort | null;
  attempt: number;
  state: TimelineCapabilityGateState;
  workspaceCacheKey: string | undefined;
}

/**
 * The endpoint has no scope body, but its authorization is workspace-bound.
 * Keep a descriptor through cluster changes in one workspace, while a
 * workspace transition receives a separate preflight/cache entry.
 */
export function TimelineCapabilityGate({
  children,
  enabled,
  port,
  scopeContent,
  workspaceCacheKey,
}: {
  children: ReactNode;
  enabled: boolean;
  port: TimelinePort;
  scopeContent: ReactNode;
  workspaceCacheKey: string | undefined;
}) {
  const [attempt, setAttempt] = useState(0);
  const [record, setRecord] = useState<TimelineCapabilityRecord>({
    port: null,
    attempt: -1,
    state: { phase: "idle" },
    workspaceCacheKey: undefined,
  });
  const recordRef = useRef(record);
  const mountedRef = useRef(true);
  useEffect(() => {
    // React StrictMode performs a setup → cleanup → setup cycle. Re-arm the
    // component lifecycle on every setup, while request-local cancellation
    // below continues to reject stale completions from the previous cycle.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const current = recordRef.current;
    if (
      current.port === port
      && current.attempt === attempt
      && current.workspaceCacheKey === workspaceCacheKey
      && current.state.phase === "ready"
    ) return;

    const readCapabilities = port.readCapabilities;
    if (readCapabilities === undefined) {
      setCapabilityRecord(
        {
          port,
          attempt,
          state: { phase: "failed", failure: missingCapabilityReaderFailure() },
          workspaceCacheKey,
        },
        recordRef,
        setRecord,
      );
      return;
    }

    const controller = new AbortController();
    let activeRequest = true;
    setCapabilityRecord(
      { port, attempt, state: { phase: "loading" }, workspaceCacheKey },
      recordRef,
      setRecord,
    );
    void Promise.resolve()
      .then(() => readCapabilities(controller.signal, workspaceCacheKey))
      .then((descriptor) => readCapabilityProjection(port, descriptor))
      .then(
        (capabilities) => {
          if (!activeRequest || !mountedRef.current) return;
          const latest = recordRef.current;
          if (
            latest.port !== port
            || latest.attempt !== attempt
            || latest.workspaceCacheKey !== workspaceCacheKey
          ) return;
          setCapabilityRecord(
            { port, attempt, state: { phase: "ready", capabilities }, workspaceCacheKey },
            recordRef,
            setRecord,
          );
        },
        (error: unknown) => {
          if (!activeRequest || !mountedRef.current) return;
          const latest = recordRef.current;
          if (
            latest.port !== port
            || latest.attempt !== attempt
            || latest.workspaceCacheKey !== workspaceCacheKey
          ) return;
          setCapabilityRecord(
            {
              port,
              attempt,
              state: { phase: "failed", failure: toCapabilityFailure(error) },
              workspaceCacheKey,
            },
            recordRef,
            setRecord,
          );
        },
      );
    return () => {
      activeRequest = false;
      controller.abort();
    };
  }, [attempt, enabled, port, workspaceCacheKey]);

  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);
  const active = record.port === port
    && record.attempt === attempt
    && record.workspaceCacheKey === workspaceCacheKey
    ? record.state
    : { phase: "idle" } as const;

  if (!enabled) return <>{scopeContent}</>;
  if (active.phase === "idle" || active.phase === "loading") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (active.phase === "ready") return <>{children}</>;
  if (active.failure.code === "forbidden") {
    return <ProductStateScreen issue={{ code: "forbidden" }} kind="forbidden" placement="content" />;
  }
  if (active.failure.code === "offline") {
    return (
      <ProductStateScreen
        issue={{ code: "network" }}
        kind="offline"
        placement="content"
        retry={{ onRetry: retry, pending: false }}
      />
    );
  }
  if (active.failure.code === "invalid-request" || active.failure.code === "invalid-response") {
    return (
      <ProductStateScreen
        issue={{ code: "invalid-response" }}
        kind="error"
        placement="content"
        retry={{ onRetry: retry, pending: false }}
      />
    );
  }
  return (
    <ProductStateScreen
      issue={{ code: active.failure.code === "unavailable" ? "server" : "unknown" }}
      kind="error"
      placement="content"
      retry={{ onRetry: retry, pending: false }}
    />
  );
}

function timelineScopeContent(
  clusterScope: ReturnType<typeof useClusterScope>,
): ReactNode {
  if (clusterScope.selection.kind === "resolving") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (clusterScope.selection.kind === "empty") {
    return <ProductStateScreen kind="empty" placement="content" />;
  }
  if (clusterScope.selection.kind === "unavailable") {
    if (clusterScope.selection.failure.code === "forbidden") {
      return <ProductStateScreen issue={{ code: "forbidden" }} kind="forbidden" placement="content" />;
    }
    if (clusterScope.selection.failure.code === "offline") {
      return (
        <ProductStateScreen
          issue={{ code: "network" }}
          kind="offline"
          placement="content"
          retry={{ onRetry: clusterScope.refresh, pending: false }}
        />
      );
    }
    return <ProductStateScreen issue={{ code: "server" }} kind="error" placement="content" />;
  }
  return <ProductStateScreen issue={{ code: "unknown" }} kind="error" placement="content" />;
}

function setCapabilityRecord(
  next: TimelineCapabilityRecord,
  recordRef: { current: TimelineCapabilityRecord },
  setRecord: (record: TimelineCapabilityRecord) => void,
): void {
  recordRef.current = next;
  setRecord(next);
}

function missingCapabilityReaderFailure(): TimelineFailure {
  return new TimelineFailure(
    "invalid-response",
    "Timeline capability preflight is unavailable for this port.",
  );
}

function readCapabilityProjection(
  port: TimelinePort,
  descriptor: TimelineCapabilities,
): TimelineCapabilities {
  const projection = port.capabilities;
  if (
    projection.selectedSourceMode !== descriptor.selectedSourceMode
    || projection.maxRetainedRangeMs !== descriptor.maxRetainedRangeMs
    || projection.namespaceFilterPolicy !== descriptor.namespaceFilterPolicy
    || projection.availableSourceModes.length !== descriptor.availableSourceModes.length
    || projection.availableSourceModes.some((mode, index) => mode !== descriptor.availableSourceModes[index])
  ) {
    throw new TimelineFailure(
      "invalid-response",
      "Timeline capability projection did not match its preflight descriptor.",
    );
  }
  return projection;
}

function toCapabilityFailure(error: unknown): TimelineFailure {
  return error instanceof TimelineFailure
    ? error
    : new TimelineFailure("unknown");
}

function timelineClusters(
  scope: ReturnType<typeof useClusterScope>,
): readonly HomeClusterChoice[] {
  if (scope.selection.kind === "selected") return [scope.selection.cluster];
  if (scope.selection.kind === "multiple") return scope.selection.clusters;
  if (scope.selection.kind === "unfiltered" && scope.collection.phase === "ready") {
    return scope.collection.data.clusters;
  }
  return [];
}

function timelineFreshness(cluster: HomeClusterChoice): ScopeFreshness {
  if (cluster.connectionState === "online") return "live";
  if (cluster.connectionState === "stale") return "stale";
  return "disconnected";
}
