import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useOptionalProductSession } from "../../features/auth/ProductSessionContext";
import type { HomeBoardPeriod } from "../../features/home-activity/homeActivityContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { normalizeNamespaceRefs } from "../../features/filters/filterUrlSyntax";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import {
  HOME_WIDGET_IDS,
  homeBoardPreferenceKey,
  useHomeBoardPreferenceDraft,
  type HomeWidgetId,
} from "./homeBoardPreferences";
import { widgetDefinition } from "./HomeWidgetCatalog";
import { SortableWidget } from "./HomeSortableWidget";
import {
  useHomeBoardData,
  type HomeBoardPorts,
} from "./useHomeBoardData";
export function HomeWidgetBoard({
  clusters,
  editing,
  onOutOfSyncChange,
  period,
  ports,
  refreshKey,
  windowAnchorMs,
}: {
  clusters: readonly HomeClusterChoice[];
  editing: boolean;
  onOutOfSyncChange: (count: number | null) => void;
  period: HomeBoardPeriod;
  ports: HomeBoardPorts;
  refreshKey: number;
  windowAnchorMs: number;
}) {
  const session = useOptionalProductSession();
  const filter = useUnifiedFilter();
  const { t } = useI18n();
  const preferenceKey = homeBoardPreferenceKey(
    session?.workspaceId ?? null,
    session?.userId ?? null,
  );
  const { preferences: activePreferences, update } = useHomeBoardPreferenceDraft(
    editing,
    preferenceKey,
  );
  const visibleIds = activePreferences.order.filter(
    (id) => activePreferences.visible.includes(id),
  );
  const hiddenIds = HOME_WIDGET_IDS.filter(
    (id) => !activePreferences.visible.includes(id),
  );
  const scope = useMemo(() => {
    const namespaceRefs = normalizeNamespaceRefs(filter.state.common.namespaces);
    const namespaceScopeActive = namespaceRefs.length > 0;
    return {
      applications: filter.state.common.applications,
      allAccessible: filter.state.common.clusters.length === 0 && !namespaceScopeActive,
      clusters: [...clusters]
        .filter((cluster) => !namespaceScopeActive || namespaceRefs.some(
          (namespace) => namespace.clusterId === cluster.id,
        ))
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((cluster) => ({
          clusterId: cluster.id,
          freshness: clusterFreshness(cluster.connectionState),
          namespaces: namespaceRefs
            .filter((namespace) => namespace.clusterId === cluster.id)
            .map((namespace) => namespace.namespace),
          workspaceId: cluster.workspaceId,
        })),
    };
  }, [
    clusters,
    filter.state.common.applications,
    filter.state.common.clusters.length,
    filter.state.common.namespaces,
  ]);
  const data = useHomeBoardData({
    filterState: filter.state,
    period,
    ports,
    refreshKey,
    scope,
    windowAnchorMs,
    wantsCost: visibleIds.includes("W7"),
    wantsNamespaces: visibleIds.includes("W5"),
    wantsTimeline: visibleIds.includes("W8"),
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    onOutOfSyncChange(data.sync.phase === "ready" ? data.sync.data.outOfSync : null);
  }, [data.sync, onOutOfSyncChange]);

  const toggleVisible = (id: HomeWidgetId) => {
    const visible = activePreferences.visible.includes(id)
      ? activePreferences.visible.filter((candidate) => candidate !== id)
      : [...activePreferences.visible, id];
    update({
      ...activePreferences,
      collapsed: activePreferences.collapsed.filter((candidate) => visible.includes(candidate)),
      visible,
    });
  };
  const dragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const from = activePreferences.order.indexOf(event.active.id as HomeWidgetId);
    const to = activePreferences.order.indexOf(event.over.id as HomeWidgetId);
    if (from < 0 || to < 0) return;
    update({
      ...activePreferences,
      order: arrayMove([...activePreferences.order], from, to),
    });
  };

  return (
    <section className="grid min-w-0 gap-4">
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={dragEnd}
        sensors={sensors}
      >
        <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
          <div className="grid min-w-0 grid-cols-6 gap-3.5 [grid-auto-flow:row_dense] min-[1024px]:grid-cols-12">
            {visibleIds.map((id) => (
              <SortableWidget
                data={data}
                editing={editing}
                id={id}
                key={id}
                onCollapse={(collapsed) => update({
                  ...activePreferences,
                  collapsed: collapsed
                    ? [...activePreferences.collapsed, id]
                    : activePreferences.collapsed.filter((candidate) => candidate !== id),
                })}
                onRemove={() => toggleVisible(id)}
                preferences={activePreferences}
                period={period}
              />
            ))}
            {editing && hiddenIds.length > 0 ? (
              <div className="col-span-full flex min-w-0 flex-wrap items-center gap-2 rounded-card border-[1.5px] border-dashed border-border px-3.5 py-[11px]">
                <span className="text-label font-bold text-muted-foreground">
                  {t("shell.home.widget.add")}
                </span>
                {hiddenIds.map((id) => {
                  const definition = widgetDefinition(id, t, filter);
                  return (
                    <Button
                      aria-label={`${t("shell.home.widget.add")} · ${definition.title}`}
                      className="rounded-full"
                      key={id}
                      onClick={() => toggleVisible(id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Plus aria-hidden="true" className="size-3.5" />
                      {definition.title}
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}

function clusterFreshness(
  connectionState: HomeClusterChoice["connectionState"],
): "live" | "stale" | "partial" | "disconnected" {
  if (connectionState === "online") return "live";
  if (connectionState === "stale") return "stale";
  if (connectionState === "offline") return "disconnected";
  return "partial";
}
