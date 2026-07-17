import type {
  Edge,
  ReactFlowInstance,
} from "@xyflow/react";

import { useI18n } from "../../shared/i18n";
import type { InfraTopologyNode } from "./resourcesInfraMapTopologyFlowGraph";
import {
  INFRA_MAP_TOPOLOGY_ZOOM,
  nextTopologyZoomPercent,
  topologyZoomLevelFromPercent,
} from "./resourcesInfraMapTopologyZoom";
import { INFRA_MAP_TOPOLOGY_FIT_VIEW_OPTIONS } from "./resourcesInfraMapTopologyViewport";

export function ResourcesInfraMapTopologyZoomControls({
  instance,
  zoomPercent,
}: {
  instance: ReactFlowInstance<InfraTopologyNode, Edge> | undefined;
  zoomPercent: number;
}) {
  const { t } = useI18n();
  const disabled = instance === undefined;
  const zoomIn = () => {
    if (!instance) return;
    zoomTopologyByStep(instance, 1);
  };
  const zoomOut = () => {
    if (!instance) return;
    zoomTopologyByStep(instance, -1);
  };
  const fitView = () => {
    if (!instance) return;
    void instance.fitView({
      ...INFRA_MAP_TOPOLOGY_FIT_VIEW_OPTIONS,
      duration: INFRA_MAP_TOPOLOGY_ZOOM.animationMs,
    });
  };

  return (
    <div
      aria-label={t("resources.infraMap.topology.zoomControls")}
      className="absolute right-2 top-2 z-20 flex h-8 items-center overflow-hidden rounded-lg border bg-background/90 text-xs shadow-sm backdrop-blur"
      data-slot="infra-map-topology-zoom-controls"
      role="group"
    >
      <button
        aria-label={t("resources.infraMap.topology.zoomOut")}
        className="grid h-full w-8 place-items-center border-r text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-45"
        disabled={disabled}
        onClick={zoomOut}
        type="button"
      >
        -
      </button>
      <span
        aria-label={t("resources.infraMap.topology.zoomScale", { percent: zoomPercent })}
        className="grid h-full min-w-14 place-items-center border-r px-2 font-medium tabular-nums text-muted-foreground"
      >
        {zoomPercent}%
      </span>
      <button
        aria-label={t("resources.infraMap.topology.zoomIn")}
        className="grid h-full w-8 place-items-center border-r text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-45"
        disabled={disabled}
        onClick={zoomIn}
        type="button"
      >
        +
      </button>
      <button
        className="h-full px-2 font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-45"
        disabled={disabled}
        onClick={fitView}
        type="button"
      >
        {t("resources.infraMap.topology.fit")}
      </button>
    </div>
  );
}

function zoomTopologyByStep(
  instance: ReactFlowInstance<InfraTopologyNode, Edge>,
  direction: 1 | -1,
): void {
  const nextPercent = nextTopologyZoomPercent(instance.getZoom(), direction);
  void instance.zoomTo(topologyZoomLevelFromPercent(nextPercent), {
    duration: INFRA_MAP_TOPOLOGY_ZOOM.animationMs,
  });
}
