import { Link } from "react-router-dom";

import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { serializeProductFilterUrl } from "../../features/filters/filterUrl";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Donut, type ChartTone } from "../../shared/ui/charts";
import type {
  HomeBoardResource,
  HomeNamespacePodProjection,
} from "./useHomeBoardData";
import { WidgetEmpty, WidgetResource } from "./HomeBoardWidgets";

export function NamespaceWidget({
  href,
  resource,
}: {
  href: string;
  resource: HomeBoardResource<HomeNamespacePodProjection>;
}) {
  const filter = useUnifiedFilter();
  const { formatNumber, t } = useI18n();
  return (
    <WidgetResource resource={resource}>
      {(data) => {
        if (data.items.length === 0) return <WidgetEmpty href={href} />;
        const top = data.items.slice(0, 5);
        const other = data.items.slice(5).reduce((sum, item) => sum + item.pods, 0);
        const visible = other > 0
          ? [...top, { clusterIds: [], namespace: "…", pods: other }]
          : top;
        const total = visible.reduce((sum, item) => sum + item.pods, 0);
        const tones: readonly ChartTone[] = [
          "primary",
          "healthy",
          "warning",
          "critical",
          "stale",
          "unknown",
        ];
        return (
          <div className="grid gap-2">
            {data.incompleteClusterIds.length > 0 ? (
              <p className="text-caption text-muted-foreground" role="status">
                {t("common.state.partial")}
              </p>
            ) : null}
            <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-4">
              <Donut
                ariaLabel={t("metrics.preset.namespacePodCount.name")}
                segments={visible.map((item, index) => ({
                  id: item.namespace,
                  tone: tones[index] ?? "unknown",
                  value: item.pods,
                }))}
              />
              <ul className="grid min-w-0 gap-1.5">
                {visible.map((item, index) => {
                  const namespaceHref = item.namespace === "…"
                    ? null
                    : namespaceFilterHref(filter, item.clusterIds, item.namespace);
                  return (
                    <NamespaceLegendRow
                      count={formatNumber(item.pods)}
                      href={namespaceHref}
                      key={item.namespace}
                      label={item.namespace}
                      percent={total > 0
                        ? `${formatNumber(Math.round((item.pods / total) * 100))}%`
                        : "—"}
                      tone={tones[index] ?? "unknown"}
                    />
                  );
                })}
              </ul>
            </div>
          </div>
        );
      }}
    </WidgetResource>
  );
}

function NamespaceLegendRow({
  count,
  href,
  label,
  percent,
  tone,
}: {
  count: string;
  href: string | null;
  label: string;
  percent: string;
  tone: ChartTone;
}) {
  const className = [
    "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center",
    "gap-2 rounded-md px-1 py-0.5 text-caption",
  ].join(" ");
  const content = (
    <>
      <span aria-hidden="true" className={toneDotClass(tone)} />
      <span className="truncate">{label}</span>
      <strong className="font-mono tabular-nums">{count}</strong>
      <span className="w-8 text-right font-mono tabular-nums text-caption-foreground">
        {percent}
      </span>
    </>
  );
  return (
    <li className="min-w-0">
      {href ? (
        <Link
          aria-label={`${label} · ${count} · ${percent}`}
          className={cn(className, "outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60")}
          to={href}
        >
          {content}
        </Link>
      ) : (
        <span className={className}>{content}</span>
      )}
    </li>
  );
}

function namespaceFilterHref(
  filter: ReturnType<typeof useUnifiedFilter>,
  scopedClusterIds: readonly string[],
  namespace: string,
): string | null {
  const clusterIds = [...new Set(scopedClusterIds)];
  if (clusterIds.length === 0) return null;
  return `/resources${serializeProductFilterUrl({
    ...filter.state,
    common: {
      ...filter.state.common,
      clusters: clusterIds,
      namespaces: clusterIds.map((clusterId) => ({ clusterId, namespace })),
    },
    resources: {
      ...filter.state.resources,
      view: "table",
    },
  }, {
    ...filter.detail,
    resourceSurfaceView: "list",
  })}`;
}

function toneDotClass(tone: ChartTone): string {
  const classes: Record<ChartTone, string> = {
    critical: "size-2 rounded-full bg-status-critical",
    healthy: "size-2 rounded-full bg-status-healthy",
    primary: "size-2 rounded-full bg-primary",
    stale: "size-2 rounded-full bg-status-stale",
    unknown: "size-2 rounded-full bg-status-unknown",
    warning: "size-2 rounded-full bg-status-warning",
  };
  return classes[tone];
}
