import { useMemo, useState } from "react";

import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import type { InfraMapModel, InfraMapPod } from "./resourcesInfraMapModel";
import { TopologyClusterDetail } from "./ResourcesInfraMapTopologyClusterDetail";
import { TopologyClusterOverview } from "./ResourcesInfraMapTopologyClusterOverview";
import { buildInfraMapTopologyModel } from "./resourcesInfraMapTopologyModel";

export function ResourcesInfraMapTopologyView({
  metricMode,
  model,
  onOpenPod,
}: {
  metricMode: InfraMapMetricMode;
  model: InfraMapModel;
  onOpenPod: (pod: InfraMapPod) => void;
}) {
  const topology = useMemo(
    () => buildInfraMapTopologyModel(model, metricMode),
    [metricMode, model],
  );
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const detailCluster = topology.clusters.length === 1
    ? topology.clusters[0]
    : topology.clusters.find((cluster) => cluster.id === selectedClusterId) ?? null;

  if (detailCluster === null) {
    return (
      <TopologyClusterOverview
        clusters={topology.clusters}
        onSelect={setSelectedClusterId}
      />
    );
  }

  return (
    <TopologyClusterDetail
      cluster={detailCluster}
      metricMode={metricMode}
      onBack={topology.clusters.length > 1 ? () => setSelectedClusterId(null) : null}
      onOpenPod={onOpenPod}
    />
  );
}
