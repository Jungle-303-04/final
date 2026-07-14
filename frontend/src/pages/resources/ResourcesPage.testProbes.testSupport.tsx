import { useLocation } from "react-router-dom";

import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";

export function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="resources-location">
      {location.pathname}
      {location.search}
    </output>
  );
}

export function ClusterScopeProbe() {
  const scope = useClusterScope();
  return (
    <output data-testid="resources-cluster-scope">
      {scope.collection.phase}:{scope.requestedClusterId ?? "-"}
    </output>
  );
}
