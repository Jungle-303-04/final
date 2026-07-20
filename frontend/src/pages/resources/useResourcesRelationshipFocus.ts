import { useMemo, useState } from "react";

import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { ResourceTopologyView } from "../../features/filters/resourceTopologyView";
import type { RelationTopologyNode } from "../../features/resources/relationTopologyContract";
import type {
  ResourceIdentity,
  ResourceSummary,
} from "../../features/resources/resourcesContract";
import {
  exactRelationNodeId,
  exactRelationResourceIdentity,
} from "../../features/resources/relationTopologyGraphModel";
import type { RelationTopologyFrame } from "./useRelationTopologyDataFrame";

export function useResourcesRelationshipFocus({
  connectionTopology,
  detailIdentity,
  listedResources,
  onOpenDetail,
  onTopologyViewChange,
  relationTopology,
}: {
  connectionTopology: RelationTopologyFrame;
  detailIdentity: ResourceIdentity | null;
  listedResources: readonly ResourceSummary[];
  onOpenDetail: (identity: ResourceIdentity) => void;
  onTopologyViewChange: (view: ResourceTopologyView) => void;
  relationTopology: RelationTopologyFrame;
}) {
  const filter = useUnifiedFilter();
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const baseTopology = relationTopology.phase === "idle" ? connectionTopology : relationTopology;
  const displayedTopology = focusedNodeId === null ? baseTopology : connectionTopology;
  const nodes = useMemo(
    () => displayedTopology.phase === "ready" ? displayedTopology.data.nodes : [],
    [displayedTopology],
  );
  const detailNodeId = useMemo(
    () => nodes.find((node) => sameResourceIdentity(node.identity, detailIdentity))?.id ??
      exactRelationNodeId(detailIdentity, listedResources),
    [detailIdentity, listedResources, nodes],
  );
  const selectResource = (resourceId: string) => {
    const identity = nodes.find((node) => node.id === resourceId)?.identity ??
      exactRelationResourceIdentity(resourceId, listedResources);
    if (identity === null) return false;
    onOpenDetail(identity);
    return true;
  };
  const focusNode = (node: RelationTopologyNode | null) => {
    setFocusedNodeId(node?.id ?? null);
    if (node) onTopologyViewChange("relations");
  };
  return {
    displayedTopology,
    focusNode,
    repositoryHref: filter.navigationHref("/deploy", {
      ...filter.detail,
      surfaceTab: "repositories",
    }),
    selectedResourceId: focusedNodeId ?? detailNodeId,
    selectResource,
  };
}

function sameResourceIdentity(left: ResourceIdentity, right: ResourceIdentity | null): boolean {
  return right !== null && left.resourceType === right.resourceType && left.kind === right.kind &&
    left.namespace === right.namespace && left.name === right.name;
}
