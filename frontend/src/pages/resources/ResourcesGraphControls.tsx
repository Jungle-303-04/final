import { ChevronDown, ChevronUp, Server, Waypoints } from "lucide-react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

import type { TimelineRange } from "../../features/filters/filterContract";
import type { ResourceTopologyView } from "../../features/filters/resourceTopologyView";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { ButtonGroup } from "../../shared/ui/primitives/button-group";
import type { PhysicalTopologyFrame } from "./usePhysicalTopologyDataFrame";
import type { RelationTopologyFrame } from "./useRelationTopologyDataFrame";
import {
  PhysicalGraphBreadcrumb,
  TimelineRangeSelect,
  type PhysicalGraphBreadcrumbItem,
} from "./ResourcesGraphChrome";
import { MAX_GRAPH_HEIGHT, MIN_GRAPH_HEIGHT } from "./useResizableGraphHeight";

export function ResourcesGraphHeader({
  breadcrumbs,
  collapsed,
  displayedView,
  onCollapsedChange,
  onSelectAll,
  onTimelineRangeChange,
  onTopologyViewChange,
  physicalFrame,
  relationFrame,
  timelineRange,
  topologyView,
}: {
  breadcrumbs: PhysicalGraphBreadcrumbItem[];
  collapsed: boolean;
  displayedView: ResourceTopologyView;
  onCollapsedChange: (collapsed: boolean) => void;
  onSelectAll: () => void;
  onTimelineRangeChange: (value: TimelineRange) => void;
  onTopologyViewChange: (view: ResourceTopologyView) => void;
  physicalFrame: PhysicalTopologyFrame;
  relationFrame: RelationTopologyFrame;
  timelineRange: TimelineRange;
  topologyView: ResourceTopologyView;
}) {
  const { formatNumber, t } = useI18n();
  const count = displayedView === "physical" && physicalFrame.phase === "ready"
    ? physicalFrame.data.servers.length
    : displayedView === "relations" && relationFrame.phase === "ready"
      ? relationFrame.data.nodes.length
      : null;
  return (
    <div className={cn(
      "relative z-20 flex min-w-0 flex-wrap items-center justify-between gap-2 border-b bg-background px-3 py-2",
      collapsed ? "flex-1" : "shrink-0",
    )}>
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="secondary">
          {displayedView === "physical" ? <Server aria-hidden="true" /> : <Waypoints aria-hidden="true" />}
          <span id="resources-graph-title">
            {t(displayedView === "physical"
              ? "resources.graph.physical.title"
              : "resources.graph.relations.title")}
          </span>
        </Badge>
        {count === null ? null : (
          <Badge variant="outline">
            {t(displayedView === "physical"
              ? "resources.graph.server.total"
              : "resources.graph.relations.total", { count: formatNumber(count) })}
          </Badge>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {!collapsed ? (
          <>
            <TimelineRangeSelect onChange={onTimelineRangeChange} value={timelineRange} />
            <ButtonGroup aria-label={t("resources.graph.view.aria")}>
              {(["physical", "relations"] as const).map((view) => (
                <Button
                  aria-pressed={topologyView === view}
                  key={view}
                  onClick={() => onTopologyViewChange(view)}
                  size="sm"
                  type="button"
                  variant={topologyView === view ? "secondary" : "outline"}
                >
                  {t(`resources.graph.view.${view}`)}
                </Button>
              ))}
            </ButtonGroup>
            <PhysicalGraphBreadcrumb items={breadcrumbs} onSelectAll={onSelectAll} />
          </>
        ) : null}
        <Button
          aria-expanded={!collapsed}
          aria-label={t(collapsed ? "resources.graph.expand" : "resources.graph.collapse")}
          onClick={() => onCollapsedChange(!collapsed)}
          size="icon-sm"
          title={t(collapsed ? "resources.graph.expand" : "resources.graph.collapse")}
          type="button"
          variant="ghost"
        >
          {collapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}

export function ResourcesGraphResizeHandle({
  height,
  onResizeBy,
  onResizeStart,
  onReset,
}: {
  height: number;
  onResizeBy: (delta: number) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onReset: () => void;
}) {
  const { t } = useI18n();
  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp") onResizeBy(-24);
    else if (event.key === "ArrowDown") onResizeBy(24);
    else if (event.key === "Home") onReset();
    else return;
    event.preventDefault();
  };
  return (
    <div
      aria-label={t("resources.graph.resize")}
      aria-orientation="horizontal"
      aria-valuemax={MAX_GRAPH_HEIGHT}
      aria-valuemin={MIN_GRAPH_HEIGHT}
      aria-valuenow={height}
      className="group/graph-resize grid h-2 shrink-0 cursor-row-resize place-items-center border-t bg-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      data-slot="resources-graph-resize-handle"
      onDoubleClick={onReset}
      onKeyDown={resizeWithKeyboard}
      onPointerDown={onResizeStart}
      role="separator"
      tabIndex={0}
      title={t("resources.graph.resize.reset")}
    >
      <span aria-hidden="true" className="h-0.5 w-10 rounded-full bg-border transition-colors group-hover/graph-resize:bg-ring" />
    </div>
  );
}
