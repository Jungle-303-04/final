import type { RelationTopologyNode } from "../../features/resources/relationTopologyContract";
import { ResourcesCatalog } from "./ResourcesCatalog";
import { ResourcesConnectionPanel } from "./ResourcesConnectionPanel";
import type { RelationTopologyFrame } from "./useRelationTopologyDataFrame";
import type { useResourcesPageState } from "./useResourcesPageState";

export function ResourcesListRail({
  connectionTopology,
  focusedNodeId,
  onFocus,
  repositoryHref,
  state,
}: {
  connectionTopology: RelationTopologyFrame;
  focusedNodeId: string | null;
  onFocus: (node: RelationTopologyNode | null) => void;
  repositoryHref: string;
  state: ReturnType<typeof useResourcesPageState>;
}) {
  return (
    <aside
      className="min-w-0 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100svh-8.5rem)]"
      data-slot={state.view === "map" ? "resources-connection-rail" : "resources-catalog-rail"}
    >
      {state.view === "map" ? (
        <ResourcesConnectionPanel
          focusedNodeId={focusedNodeId}
          frame={connectionTopology}
          onFocus={onFocus}
          onOpen={(node) => state.openDetail(node.identity)}
          repositoryHref={repositoryHref}
        />
      ) : (
        <ResourcesCatalog
          discovery={state.catalog.phase === "ready" ? state.catalog.data.apiDiscovery : undefined}
          items={state.catalog.phase === "ready" ? state.catalog.data.items : []}
          onSelect={state.selectResourceType}
          selectedResourceType={state.selectedResourceType}
        />
      )}
    </aside>
  );
}
