import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";

import {
  createEmptyProductDetailQuery,
  createEmptyUnifiedFilterState,
} from "../../features/filters/filterContract";
import { serializeProductFilterUrl } from "../../features/filters/filterUrl";
import { useFilterSearchParams } from "../../features/filters/routeSearchAdapter";
import type { RcaContextPort } from "../../features/issues/rcaContextContract";
import type { WorkloadDetailPort } from "../../features/workload-detail/workloadDetailContract";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { encodeResourceDetail } from "../resources/resourcesUrlState";
import { parseWorkloadDetailRoute } from "./workloadDetailNavigation";

export function WorkloadDetailRoute(_props: {
  port: WorkloadDetailPort;
  rcaContextPort?: RcaContextPort;
}) {
  const params = useParams();
  const search = useFilterSearchParams();
  const identity = useMemo(
    () => parseWorkloadDetailRoute(params, search),
    [params, search],
  );
  if (identity === null) {
    return (
      <ProductStateScreen
        issue={{ code: "invalid-response" }}
        kind="error"
        placement="content"
      />
    );
  }
  const filters = createEmptyUnifiedFilterState();
  filters.common.clusters = [identity.clusterId];
  filters.common.namespaces = identity.namespace
    ? [{ clusterId: identity.clusterId, namespace: identity.namespace }]
    : [];
  filters.resources.types = ["workload"];
  const detail = {
    ...createEmptyProductDetailQuery(),
    detail: encodeResourceDetail({
      kind: identity.kind,
      name: identity.name,
      namespace: identity.namespace,
      resourceType: "workload",
    }),
    full: true,
    tab: resourceDetailTab(identity.tab),
  };
  return <Navigate replace to={`/resources${serializeProductFilterUrl(filters, detail)}`} />;
}

function resourceDetailTab(tab: string): "overview" | "events" | "logs" {
  if (tab === "events") return "events";
  if (tab === "logs") return "logs";
  return "overview";
}
