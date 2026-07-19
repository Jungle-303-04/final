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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useOptionalProductSession } from "../../features/auth/ProductSessionContext";
import type { HomeBoardPeriod } from "../../features/home-activity/homeActivityContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { UnifiedFilterController } from "../../features/filters/filterContract";
import { normalizeNamespaceRefs } from "../../features/filters/filterUrlSyntax";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { WidgetFrame } from "../../shared/ui/widgets";
import {
  homeBoardPreferenceKey,
  useHomeBoardPreferenceDraft,
  type HomeBoardPreferences,
  type HomeWidgetId,
} from "./homeBoardPreferences";
import {
  ActivityWidget,
  IncidentWidget,
  SyncWidget,
} from "./HomeBoardWidgets";
import {
  CostOverviewWidget,
  CriticalResourcesWidget,
  NamespaceWidget,
  RecentTimelineWidget,
} from "./HomeOptionalBoardWidgets";
import {
  criticalResourceDetailHref,
  timelineEventHref,
  WidgetCatalog,
  widgetDefinition,
} from "./HomeWidgetCatalog";
import {
  useHomeBoardData,
  type HomeBoardData,
  type HomeBoardPorts,
} from "./useHomeBoardData";
export function HomeWidgetBoard({
  clusters,
  editing,
  onCriticalResourceCountChange,
  onOutOfSyncChange,
  period,
  ports,
  refreshKey,
}: {
  clusters: readonly HomeClusterChoice[];
  editing: boolean;
  onCriticalResourceCountChange: (count: number | null) => void;
  onOutOfSyncChange: (count: number | null) => void;
  period: HomeBoardPeriod;
  ports: HomeBoardPorts;
  refreshKey: number;
}) {
  const session = useOptionalProductSession();
  const filter = useUnifiedFilter();
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

  useEffect(() => {
    const count = data.criticalResources.phase === "ready"
      && data.criticalResources.data.filteredCountCompleteness === "exact"
      ? data.criticalResources.data.filteredCount
      : null;
    onCriticalResourceCountChange(count);
  }, [data.criticalResources, onCriticalResourceCountChange]);

  const toggleVisible = (id: HomeWidgetId) => {
    const visible = activePreferences.visible.includes(id)
      ? activePreferences.visible.filter((candidate) => candidate !== id)
      : [...activePreferences.visible, id];
    if (visible.length === 0) return;
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
      {editing ? (
        <WidgetCatalog
          onToggle={toggleVisible}
          preferences={activePreferences}
        />
      ) : null}
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={dragEnd}
        sensors={sensors}
      >
        <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
          <div className="grid min-w-0 grid-cols-6 gap-4 min-[1024px]:grid-cols-12">
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
function SortableWidget({
  data,
  editing,
  id,
  onCollapse,
  onRemove,
  preferences,
  period,
}: {
  data: HomeBoardData;
  editing: boolean;
  id: HomeWidgetId;
  onCollapse: (collapsed: boolean) => void;
  onRemove: () => void;
  preferences: HomeBoardPreferences;
  period: HomeBoardPeriod;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform } = useSortable({
    disabled: !editing,
    id,
  });
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const attachWidget = useCallback((node: HTMLDivElement | null) => {
    widgetRef.current = node;
    setNodeRef(node);
  }, [setNodeRef]);
  useLayoutEffect(() => {
    const node = widgetRef.current;
    if (!node) return;
    const value = CSS.Transform.toString(transform);
    if (value) node.style.transform = value;
    else node.style.removeProperty("transform");
  }, [transform]);
  const filter = useUnifiedFilter();
  const { t } = useI18n();
  const definition = widgetDefinition(id, t, filter);
  return (
    <div
      className={cn(
        definition.span,
        "transition-transform duration-(--motion-layout) ease-(--ease-soft) motion-reduce:transition-none",
        isDragging && "z-10 opacity-70",
      )}
      ref={attachWidget}
    >
      <WidgetFrame
        className="h-full"
        collapseLabel={t("shell.sidebar.collapse")}
        collapsed={preferences.collapsed.includes(id)}
        collapsible
        deepLink={{ href: definition.href, label: definition.title }}
        description={definition.description}
        expandLabel={t("shell.sidebar.expand")}
        headerActions={editing ? (
          <>
            <button
              {...attributes}
              {...listeners}
              aria-label={`${definition.title} · ${t("shell.ai.action.edit")}`}
              className="grid size-7 touch-none place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
              type="button"
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </button>
            <button
              aria-label={t("shell.filter.remove", {
                type: t("resources.catalog.title"),
                label: definition.title,
              })}
              className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={onRemove}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </>
        ) : undefined}
        onCollapsedChange={onCollapse}
        title={definition.title}
      >
        <WidgetBody data={data} filter={filter} href={definition.href} id={id} period={period} />
      </WidgetFrame>
    </div>
  );
}
function WidgetBody({
  data,
  filter,
  href,
  id,
  period,
}: {
  data: HomeBoardData;
  filter: UnifiedFilterController;
  href: string;
  id: HomeWidgetId;
  period: HomeBoardPeriod;
}) {
  if (id === "W2") return <IncidentWidget href={href} resource={data.incidents} />;
  if (id === "W3") return <SyncWidget resource={data.sync} />;
  if (id === "W4") return <ActivityWidget resource={data.activity} />;
  if (id === "W5") return <NamespaceWidget resource={data.namespaces} />;
  if (id === "W6") {
    return (
      <CriticalResourcesWidget
        hrefForItem={(item) => criticalResourceDetailHref(filter, item)}
        resource={data.criticalResources}
      />
    );
  }
  if (id === "W7") return <CostOverviewWidget period={period} resource={data.cost} />;
  return (
    <RecentTimelineWidget
      hrefForEvent={(sourceKey) => timelineEventHref(href, sourceKey)}
      resource={data.timeline}
    />
  );
}
