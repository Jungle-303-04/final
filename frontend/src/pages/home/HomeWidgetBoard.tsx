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
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useOptionalProductSession } from "../../features/auth/ProductSessionContext";
import type { HomeBoardPeriod } from "../../features/home-activity/homeActivityContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { UnifiedFilterController } from "../../features/filters/filterContract";
import { normalizeNamespaceRefs } from "../../features/filters/filterUrlSyntax";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Button } from "../../shared/ui/primitives/button";
import { WidgetFrame } from "../../shared/ui/widgets";
import {
  HOME_WIDGET_IDS,
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
  const filter = useUnifiedFilter();
  const { t } = useI18n();
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
  } = useSortable({
    attributes: {
      role: "group",
      roleDescription: t("shell.home.widget.sortable"),
    },
    disabled: !editing,
    id,
  });
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const attachWidget = useCallback((node: HTMLDivElement | null) => {
    widgetRef.current = node;
    setActivatorNodeRef(node);
    setNodeRef(node);
  }, [setActivatorNodeRef, setNodeRef]);
  useLayoutEffect(() => {
    const node = widgetRef.current;
    if (!node) return;
    const value = CSS.Transform.toString(transform);
    if (value) node.style.transform = value;
    else node.style.removeProperty("transform");
  }, [transform]);
  const definition = widgetDefinition(id, t, filter);
  const startKeyboardDrag = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    listeners?.onKeyDown?.(event);
  };
  const startPointerDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (isInteractiveDragTarget(event.target)) return;
    listeners?.onPointerDown?.(event);
  };
  return (
    <div
      {...(editing ? attributes : {})}
      aria-label={editing
        ? t("shell.home.widget.reorder", { title: definition.title })
        : undefined}
      className={cn(
        definition.span,
        "transition-transform duration-(--motion-layout) ease-(--ease-soft) motion-reduce:transition-none",
        editing && "cursor-grab touch-none select-none active:cursor-grabbing",
        isDragging && "z-10 opacity-70",
      )}
      data-widget-id={id}
      onKeyDown={editing ? startKeyboardDrag : undefined}
      onPointerDown={editing ? startPointerDrag : undefined}
      ref={attachWidget}
    >
      <WidgetFrame
        className="h-full"
        collapseLabel={t("shell.home.widget.collapse", { title: definition.title })}
        collapsed={preferences.collapsed.includes(id)}
        collapsible
        deepLink={{ href: definition.href, label: t("shell.home.widget.viewAll") }}
        description={definition.description}
        editing={editing}
        expandLabel={t("shell.home.widget.expand", { title: definition.title })}
        headerActions={editing ? (
          <button
            aria-label={t("shell.home.widget.hide", { title: definition.title })}
            className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={onRemove}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : undefined}
        onCollapsedChange={onCollapse}
        title={definition.title}
      >
        <WidgetBody data={data} filter={filter} href={definition.href} id={id} period={period} />
      </WidgetFrame>
    </div>
  );
}

const INTERACTIVE_DRAG_TARGET = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "[contenteditable='true']",
  "[role='button']",
  "[role='link']",
].join(",");

function isInteractiveDragTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_DRAG_TARGET) !== null;
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
  if (id === "W3") return <SyncWidget href={href} resource={data.sync} />;
  if (id === "W4") return <ActivityWidget href={href} resource={data.activity} />;
  if (id === "W5") return <NamespaceWidget href={href} resource={data.namespaces} />;
  if (id === "W6") {
    return (
      <CriticalResourcesWidget
        emptyHref={href}
        hrefForItem={(item) => criticalResourceDetailHref(filter, item)}
        resource={data.criticalResources}
      />
    );
  }
  if (id === "W7") return <CostOverviewWidget href={href} period={period} resource={data.cost} />;
  return (
    <RecentTimelineWidget
      href={href}
      hrefForEvent={(sourceKey) => timelineEventHref(href, sourceKey)}
      resource={data.timeline}
    />
  );
}
