import { useState } from "react";
import { RefreshCw, Server, SlidersHorizontal, Waypoints, X } from "lucide-react";

import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../shared/ui/primitives/command";
import { Popover, PopoverContent, PopoverTrigger } from "../../shared/ui/primitives/popover";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import { ResourcesInfraMapTopologyView } from "./ResourcesInfraMapTopologyView";
import { InfraMapNodeCard } from "./ResourcesInfraMapNodeCard";
import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import type { InfraMapModel } from "./resourcesInfraMapModel";
import type { InfraMapFocusItem } from "./useInfraMapFocusDetails";
import type { PhysicalTopologyFrame } from "./usePhysicalTopologyDataFrame";

type InfraMapViewerMode = "card" | "topology";

const INFRA_MAP_VIEWER_MODES: InfraMapViewerMode[] = ["card", "topology"];

export function ResourcesInfraMapView({
  focusOptions,
  model,
  onFocusRemove,
  onFocusSelect,
  onOpenPod,
  onRetry,
  onShowMorePods,
  phase,
  selectedFocus,
}: {
  focusOptions: readonly InfraMapFocusItem[];
  model: InfraMapModel | null;
  onFocusRemove: (key: string) => void;
  onFocusSelect: (item: InfraMapFocusItem) => void;
  onOpenPod: (pod: InfraMapModel["nodes"][number]["visiblePods"][number]) => void;
  onRetry: () => void;
  onShowMorePods: (node: InfraMapModel["nodes"][number]) => void;
  phase: PhysicalTopologyFrame["phase"];
  selectedFocus: readonly InfraMapFocusItem[];
}) {
  const { t } = useI18n();
  const [metricMode, setMetricMode] = useState<InfraMapMetricMode>("cpu");
  const [viewerMode, setViewerMode] = useState<InfraMapViewerMode>("card");
  const availableFocusOptions = focusOptions.filter(
    (option) => !selectedFocus.some((item) => item.key === option.key),
  );
  return (
    <div
      aria-live="polite"
      className="grid min-h-56 min-w-0 overflow-hidden bg-linear-to-b from-muted/20 via-card to-muted/40 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
      data-slot="resources-infra-map-shell"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Server aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            <h2 className="truncate text-lg font-semibold" id="resources-infra-map-title">
              {t("resources.infraMap.title")}
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("resources.infraMap.description")}
          </p>
        </div>
        <InfraMapViewerTabs onChange={setViewerMode} value={viewerMode} />
      </div>
      <div className="mt-4 flex min-w-0 items-center gap-2">
        <InfraMapMetricTabs onChange={setMetricMode} value={metricMode} />
        <InfraMapFocusChips
          items={selectedFocus}
          onRemove={onFocusRemove}
        />
        <InfraMapFocusPicker
          options={availableFocusOptions}
          onSelect={onFocusSelect}
        />
      </div>

      <InfraMapViewerContent
        metricMode={metricMode}
        model={model}
        onOpenPod={onOpenPod}
        onRetry={onRetry}
        onShowMorePods={onShowMorePods}
        phase={phase}
        viewerMode={viewerMode}
      />
    </div>
  );
}

function InfraMapViewerTabs({
  onChange,
  value,
}: {
  onChange: (value: InfraMapViewerMode) => void;
  value: InfraMapViewerMode;
}) {
  const { t } = useI18n();
  return (
    <div
      className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground"
      data-slot="infra-map-viewer-tabs"
    >
      <span className="shrink-0">{t("resources.infraMap.viewer.label")}</span>
      <div
        aria-label={t("resources.infraMap.viewerTabs.aria")}
        className="flex h-8 items-center gap-0.5 rounded-lg border bg-background/70 p-0.5"
        role="group"
      >
        {INFRA_MAP_VIEWER_MODES.map((option) => {
          const active = option === value;
          return (
            <Button
              aria-pressed={active}
              className="h-7 rounded-md px-2 data-[active=true]:bg-muted"
              data-active={active || undefined}
              key={option}
              onClick={() => onChange(option)}
              size="sm"
              type="button"
              variant={active ? "secondary" : "ghost"}
            >
              {infraMapViewerLabel(option, t)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function InfraMapViewerContent({
  metricMode,
  model,
  onOpenPod,
  onRetry,
  onShowMorePods,
  phase,
  viewerMode,
}: {
  metricMode: InfraMapMetricMode;
  model: InfraMapModel | null;
  onOpenPod: (pod: InfraMapModel["nodes"][number]["visiblePods"][number]) => void;
  onRetry: () => void;
  onShowMorePods: (node: InfraMapModel["nodes"][number]) => void;
  phase: PhysicalTopologyFrame["phase"];
  viewerMode: InfraMapViewerMode;
}) {
  return (
    <>
      {phase === "loading" || phase === "idle" ? (
        <InfraMapLoading />
      ) : phase === "failed" ? (
        <InfraMapFailure onRetry={onRetry} />
      ) : model && model.nodes.length > 0 ? (
        viewerMode === "topology" ? (
        <ResourcesInfraMapTopologyView
          metricMode={metricMode}
          model={model}
          onOpenPod={onOpenPod}
        />
      ) : (
          <InfraMapNodeGrid
            metricMode={metricMode}
            model={model}
            onOpenPod={onOpenPod}
            onShowMorePods={onShowMorePods}
          />
        )
      ) : (
        <InfraMapEmpty />
      )}
    </>
  );
}

function InfraMapMetricTabs({
  onChange,
  value,
}: {
  onChange: (value: InfraMapMetricMode) => void;
  value: InfraMapMetricMode;
}) {
  const { t } = useI18n();
  const options: InfraMapMetricMode[] = ["cpu", "memory"];
  return (
    <div
      aria-label={t("resources.infraMap.metricTabs.aria")}
      className="flex h-8 items-center gap-0.5 rounded-lg border bg-background/70 p-0.5"
      role="group"
    >
      {options.map((option) => {
        const active = option === value;
        return (
          <Button
            aria-pressed={active}
            className="h-7 rounded-md px-2 data-[active=true]:bg-muted"
            data-active={active || undefined}
            key={option}
            onClick={() => onChange(option)}
            size="sm"
            type="button"
            variant={active ? "secondary" : "ghost"}
          >
            {infraMapMetricLabel(option, t)}
          </Button>
        );
      })}
    </div>
  );
}

function InfraMapFocusChips({
  items,
  onRemove,
}: {
  items: readonly InfraMapFocusItem[];
  onRemove: (key: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1.5"
      data-slot="infra-map-focus-chips"
    >
      {items.map((item) => (
        <span
          className="inline-flex h-7 max-w-56 items-center gap-1 rounded-full border bg-background/80 px-2 text-xs font-medium"
          key={item.key}
          title={focusTitle(item)}
        >
          <span className="truncate">{item.label}</span>
          <button
            aria-label={t("resources.infraMap.focus.remove", { label: item.label })}
            className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onRemove(item.key)}
            type="button"
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

function InfraMapFocusPicker({
  options,
  onSelect,
}: {
  options: readonly InfraMapFocusItem[];
  onSelect: (item: InfraMapFocusItem) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        aria-label={t("resources.infraMap.focus.open")}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background/70 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <SlidersHorizontal aria-hidden="true" className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72" initialFocus>
        <Command label={t("resources.infraMap.focus.open")}>
          <CommandInput placeholder={t("resources.infraMap.focus.placeholder")} />
          <CommandList>
            {options.length === 0 ? (
              <CommandEmpty>{t("resources.infraMap.focus.empty")}</CommandEmpty>
            ) : (
              <CommandGroup heading={t("resources.infraMap.focus.group")}>
                {options.map((item) => (
                  <CommandItem
                    key={item.key}
                    onSelect={() => {
                      onSelect(item);
                      setOpen(false);
                    }}
                    value={`${item.label} ${item.identity.namespace ?? ""}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.identity.namespace ? (
                      <span className="text-xs text-muted-foreground">
                        {item.identity.namespace}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function infraMapMetricLabel(
  option: InfraMapMetricMode,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (option === "cpu") return t("resources.infraMap.metric.cpu");
  return t("resources.infraMap.metric.memory");
}

function infraMapViewerLabel(
  option: InfraMapViewerMode,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (option === "card") return t("resources.infraMap.viewer.card");
  return t("resources.infraMap.viewer.topology");
}

function focusTitle(item: InfraMapFocusItem): string {
  return item.identity.namespace
    ? `${item.label} · ${item.identity.namespace}`
    : item.label;
}

function InfraMapNodeGrid({
  metricMode,
  model,
  onOpenPod,
  onShowMorePods,
}: {
  metricMode: InfraMapMetricMode;
  model: InfraMapModel;
  onOpenPod: (pod: InfraMapModel["nodes"][number]["visiblePods"][number]) => void;
  onShowMorePods: (node: InfraMapModel["nodes"][number]) => void;
}) {
  const layout = infraMapNodeGridLayout(model.nodes.length);
  return (
    <div
      className={layout.className}
      data-layout={layout.name}
      data-slot="infra-map-node-grid"
    >
      {model.nodes.map((node) => (
        <InfraMapNodeCard
          key={node.id}
          metricMode={metricMode}
          node={node}
          onOpenPod={onOpenPod}
          onShowMorePods={onShowMorePods}
          selectionActive={model.selection.active}
        />
      ))}
    </div>
  );
}

function infraMapNodeGridLayout(nodeCount: number): {
  className: string;
  name: "single" | "grid";
} {
  return {
    className: [
      "mt-4 grid w-full justify-center gap-3",
      "grid-cols-[repeat(auto-fit,minmax(17rem,18rem))]",
      "items-start",
    ].join(" "),
    name: nodeCount <= 1 ? "single" : "grid",
  };
}

function InfraMapLoading() {
  return (
    <div className="mt-5 grid justify-center gap-3 grid-cols-[repeat(auto-fit,minmax(17rem,18rem))]">
      {[0, 1].map((item) => (
        <div className="rounded-lg border bg-background/65 p-3" key={item}>
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="mt-3 h-4 w-1/2" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

function InfraMapFailure({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mt-5 grid min-h-36 place-items-center rounded-lg border border-dashed bg-background/50 px-6 text-center">
      <div className="grid justify-items-center gap-3">
        <Waypoints aria-hidden="true" className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">{t("resources.infraMap.failed")}</p>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          <RefreshCw aria-hidden="true" />
          {t("common.action.retry")}
        </Button>
      </div>
    </div>
  );
}

function InfraMapEmpty() {
  const { t } = useI18n();
  return (
    <div className="mt-5 grid min-h-36 place-items-center rounded-lg border border-dashed bg-background/50 px-6 text-center">
      <div className="grid max-w-lg justify-items-center gap-3">
        <Waypoints aria-hidden="true" className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          {t("resources.infraMap.empty")}
        </p>
      </div>
    </div>
  );
}
