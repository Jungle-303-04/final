import { Boxes, Layers3, Server, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ClusterProviderIcon } from "../../features/cluster-scope/ClusterProviderIcon";
import type {
  HomeClusterChoice,
  HomeConnectionState,
} from "../../features/home/homeContract";
import { STAGGER_MS, useStagger } from "../../motion/useStagger";
import { captureRouteMorph } from "../../motion/useCameraMorph";
import { useI18n, type MessageKey } from "../../shared/i18n";
import { StatusMark, type StatusTone } from "../../shared/ui/StatusMark";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../shared/ui/primitives/card";
import { cn } from "../../shared/ui/primitives/cn";

const connectionLabelKeys: Record<HomeConnectionState, MessageKey> = {
  online: "clusters.connection.online",
  stale: "clusters.connection.stale",
  pending: "clusters.connection.pending",
  offline: "clusters.connection.offline",
  unknown: "clusters.connection.unknown",
};

const connectionTones: Record<HomeConnectionState, StatusTone> = {
  online: "healthy",
  stale: "stale",
  pending: "warning",
  offline: "unknown",
  unknown: "unknown",
};

export function ClusterCard({
  cluster,
  href,
  index,
}: {
  cluster: HomeClusterChoice;
  href: string;
  index: number;
}) {
  const { formatNumber, locale, t } = useI18n();
  const cardRef = useRef<HTMLDivElement>(null);
  const delay = useStagger(index, STAGGER_MS.node);
  const disconnected = cluster.connectionState !== "online";

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    card.style.animationDelay = `${delay}ms`;
    return () => {
      card.style.removeProperty("animation-delay");
    };
  }, [delay]);

  return (
    <Link
      aria-label={t("clusters.card.openResources", { name: cluster.name })}
      className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      onClick={() => captureRouteMorph(document)}
      to={href}
    >
      <Card
        className={cn(
          "motion-node-land min-h-64 transition-[border-color,box-shadow,transform] duration-(--motion-quick) ease-(--ease-out) hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-md motion-reduce:transition-none",
          disconnected && "bg-muted/30 text-muted-foreground saturate-0",
        )}
        data-cluster-id={cluster.id}
        ref={cardRef}
      >
        <CardHeader className="grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-lg">{cluster.name}</CardTitle>
            <p className="mt-1 truncate text-xs text-muted-foreground">{cluster.environment}</p>
          </div>
          <ClusterProviderIcon className="size-8 [&_svg]:size-8" provider={cluster.provider} />
        </CardHeader>

        <CardContent className="grid flex-1 content-between gap-5">
          <div className="grid gap-3">
            <StatusMark
              label={t(connectionLabelKeys[cluster.connectionState])}
              tone={connectionTones[cluster.connectionState]}
            />
            {disconnected && cluster.lastObservedAt ? (
              <p className="text-xs text-muted-foreground">
                {t("clusters.lastResponse", {
                  time: formatRelativeTime(cluster.lastObservedAt, locale),
                })}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3">
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
              {(cluster.serverCount ?? cluster.nodeCount) == null ? null : (
                <ClusterMetric icon={<Server />} label={t("clusters.metric.servers", {
                  count: formatNumber(cluster.serverCount ?? cluster.nodeCount ?? 0),
                })} />
              )}
              {cluster.podCount === null ? null : (
                <ClusterMetric icon={<Boxes />} label={t("clusters.metric.pods", {
                  count: formatNumber(cluster.podCount),
                })} />
              )}
              {cluster.appCount == null ? null : (
                <ClusterMetric icon={<Layers3 />} label={t("clusters.metric.apps", {
                  count: formatNumber(cluster.appCount),
                })} />
              )}
            </div>

            {cluster.openIncidentCount == null ? null : cluster.openIncidentCount > 0 ? (
              <ClusterMetric
                className="text-destructive"
                icon={<TriangleAlert />}
                label={t("clusters.metric.incidents", {
                  count: formatNumber(cluster.openIncidentCount),
                })}
              />
            ) : (
              <ClusterMetric
                className="text-status-healthy"
                icon={<ShieldCheck />}
                label={t("clusters.metric.healthy")}
              />
            )}

            <ServerPreview
              clusterId={cluster.id}
              count={cluster.serverCount ?? cluster.nodeCount}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ClusterMetric({
  className,
  icon,
  label,
}: {
  className?: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <span aria-hidden="true" className="[&_svg]:size-3.5">{icon}</span>
      {label}
    </span>
  );
}

function ServerPreview({ clusterId, count }: { clusterId: string; count?: number | null }) {
  const { formatNumber, t } = useI18n();
  if (count == null || count === 0) return null;
  const visibleCount = Math.min(count, 5);
  return (
    <div
      aria-label={t("clusters.preview.aria")}
      className="flex min-h-6 items-center gap-1.5"
      data-slot="cluster-server-preview"
      role="img"
    >
      {Array.from({ length: visibleCount }, (_, previewIndex) => (
        <span
          aria-hidden="true"
          className="h-3.5 w-5 rounded-[0.2rem] border border-current/40 bg-current/10"
          data-morph-id={`server:${clusterId}:${previewIndex}`}
          key={previewIndex}
        />
      ))}
      {count > visibleCount ? (
        <span className="ml-1 text-xs font-medium text-muted-foreground">
          {t("clusters.preview.more", { count: formatNumber(count - visibleCount) })}
        </span>
      ) : null}
    </div>
  );
}

function formatRelativeTime(value: string, locale: "en" | "ko"): string {
  const deltaMilliseconds = new Date(value).getTime() - Date.now();
  const absolute = Math.abs(deltaMilliseconds);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const [amount, unit] = absolute < hour
    ? [Math.round(deltaMilliseconds / minute), "minute" as const]
    : absolute < day
      ? [Math.round(deltaMilliseconds / hour), "hour" as const]
      : [Math.round(deltaMilliseconds / day), "day" as const];
  const nonZeroAmount = amount === 0 ? -1 : amount;
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(nonZeroAmount, unit);
}
