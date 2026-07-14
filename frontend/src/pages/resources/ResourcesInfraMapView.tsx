import { useState } from "react";
import { RefreshCw, Server, Waypoints } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import { InfraMapNodeCard } from "./ResourcesInfraMapNodeCard";
import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import type { InfraMapModel } from "./resourcesInfraMapModel";

export type InfraMapViewPhase = "idle" | "loading" | "ready" | "failed";

export function ResourcesInfraMapView({
  model,
  onRetry,
  phase,
}: {
  model: InfraMapModel | null;
  onRetry: () => void;
  phase: InfraMapViewPhase;
}) {
  const { t } = useI18n();
  const [metricMode, setMetricMode] = useState<InfraMapMetricMode>("cpu");
  return (
    <div
      aria-live="polite"
      className="grid min-h-72 min-w-0 overflow-hidden bg-linear-to-b from-muted/20 via-card to-muted/40 p-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
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
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <InfraMapMetricTabs onChange={setMetricMode} value={metricMode} />
          <Badge variant="outline">
            {model?.selection.active
              ? t("resources.infraMap.badge.selected")
              : t("resources.infraMap.badge.overview")}
          </Badge>
        </div>
      </div>

      {phase === "loading" || phase === "idle" ? (
        <InfraMapLoading />
      ) : phase === "failed" ? (
        <InfraMapFailure onRetry={onRetry} />
      ) : model && model.nodes.length > 0 ? (
        <InfraMapNodeGrid metricMode={metricMode} model={model} />
      ) : (
        <InfraMapEmpty />
      )}
    </div>
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

function infraMapMetricLabel(
  option: InfraMapMetricMode,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (option === "cpu") return t("resources.infraMap.metric.cpu");
  return t("resources.infraMap.metric.memory");
}

function InfraMapNodeGrid({
  metricMode,
  model,
}: {
  metricMode: InfraMapMetricMode;
  model: InfraMapModel;
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
          selectionActive={model.selection.active}
        />
      ))}
    </div>
  );
}

function infraMapNodeGridLayout(nodeCount: number): {
  className: string;
  name: "single" | "pair" | "trio" | "many";
} {
  const baseClassName = "mt-5 grid w-full items-start gap-3";
  if (nodeCount <= 1) {
    return {
      className: `${baseClassName} max-w-xl grid-cols-1 justify-self-center`,
      name: "single",
    };
  }
  if (nodeCount === 2) {
    return {
      className: `${baseClassName} max-w-5xl grid-cols-1 justify-self-center lg:grid-cols-2`,
      name: "pair",
    };
  }
  if (nodeCount === 3) {
    return {
      className: `${baseClassName} max-w-7xl grid-cols-1 justify-self-center lg:grid-cols-2 2xl:grid-cols-3`,
      name: "trio",
    };
  }
  return {
    className: `${baseClassName} grid-cols-1 md:grid-cols-2 2xl:grid-cols-3`,
    name: "many",
  };
}

function InfraMapLoading() {
  return (
    <div className="mt-5 grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
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
