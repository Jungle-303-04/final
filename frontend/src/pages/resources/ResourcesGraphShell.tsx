import { useEffect, useMemo, useState } from "react";
import type {
  ResourceDetail,
  ResourceInfraMap,
  ResourcesPort,
} from "../../features/resources/resourcesContract";
import { ResourcesInfraMapView } from "./ResourcesInfraMapView";
import type { ResourcesResourceState } from "./resourcesPageStateModel";
import { buildInfraMapModel } from "./resourcesInfraMapModel";

const INFRA_MAP_LIMIT = 200;

type InfraMapState =
  | { phase: "idle" | "loading" }
  | { phase: "ready"; data: ResourceInfraMap }
  | { phase: "failed" };

export function ResourcesGraphShell({
  clusterId,
  detail,
  detailRequested,
  includeDeleted,
  port,
}: {
  clusterId: string | null;
  detail: ResourcesResourceState<ResourceDetail>;
  detailRequested: boolean;
  includeDeleted: boolean;
  port: ResourcesPort;
}) {
  const [state, setState] = useState<InfraMapState>({ phase: "idle" });
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (clusterId === null) {
      setState({ phase: "idle" });
      return;
    }
    const controller = new AbortController();
    setState({ phase: "loading" });
    port.loadInfraMap(
      clusterId,
      { includeDeleted, limit: INFRA_MAP_LIMIT },
      controller.signal,
    ).then((data) => {
      setState({ phase: "ready", data });
    }).catch((error: unknown) => {
      if (isAbortError(error)) return;
      setState({ phase: "failed" });
    });
    return () => controller.abort();
  }, [clusterId, includeDeleted, port, retryToken]);

  const selectedDetail = detailRequested && detail.phase === "ready" ? detail.data : null;
  const model = useMemo(() => state.phase === "ready"
    ? buildInfraMapModel({
        detail: selectedDetail,
        nodes: state.data.nodes,
        pods: state.data.pods,
      })
    : null, [selectedDetail, state]);

  return (
    <ResourcesInfraMapView
      model={model}
      onRetry={() => setRetryToken((value) => value + 1)}
      phase={state.phase}
    />
  );
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
