import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import type { HomeBoardPeriod } from "../../features/home-activity/homeActivityContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { UnifiedFilterController } from "../../features/filters/filterContract";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { WidgetFrame } from "../../shared/ui/widgets";
import type {
  HomeBoardPreferences,
  HomeWidgetId,
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
import type { HomeBoardData } from "./useHomeBoardData";

export function SortableWidget({
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
