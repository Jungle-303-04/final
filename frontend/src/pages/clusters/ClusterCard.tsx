import { LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { ClusterProviderIcon } from "../../features/cluster-scope/ClusterProviderIcon";
import type {
  HomeClusterChoice,
  HomeConnectionState,
  HomeUsageSnapshot,
} from "../../features/home/homeContract";
import { captureRouteMorph } from "../../motion/useCameraMorph";
import { STAGGER_MS, useStagger } from "../../motion/useStagger";
import { useI18n } from "../../shared/i18n";
import { StatusPill, type StatusTone } from "../../shared/ui/status";
import { Button } from "../../shared/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { cn } from "@/shared/lib/cn";
import type { DisconnectPhase } from "./ClusterDisconnectDialog";
import {
  ClusterCardMenu,
  clusterPlatformLabel,
  connectionReasonKey,
  disconnectProgressStep,
  isProductionEnvironment,
  metricValue,
  UsageBar,
} from "./ClusterCardSupport";
import "../../shared/ui/brand/brand.css";

const connectionTones: Record<HomeConnectionState, StatusTone> = {
  online: "healthy",
  stale: "stale",
  pending: "warning",
  offline: "unknown",
  unknown: "unknown",
};

export function ClusterCard({
  cluster,
  disconnectPhase,
  href,
  index,
  onDisconnect,
  onRefresh,
  usage = null,
  variant = "fleet",
}: {
  cluster: HomeClusterChoice;
  disconnectPhase?: DisconnectPhase;
  href: string;
  index: number;
  onDisconnect?: () => void;
  onRefresh?: () => void;
  usage?: HomeUsageSnapshot | null;
  variant?: "fleet" | "map";
}) {
  const { formatNumber, t } = useI18n();
  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const delay = useStagger(index, STAGGER_MS.node);
  const disconnected = cluster.connectionState !== "online";
  const simulation = cluster.observationMode === "simulation";
  const disconnectStep = disconnectProgressStep(disconnectPhase);
  const incidents = cluster.openIncidentCount ?? cluster.incidentCount;
  const tone = incidents != null && incidents > 0
    ? "critical"
    : cluster.health ?? connectionTones[cluster.connectionState];
  const platform = clusterPlatformLabel(cluster.provider);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    card.style.animationDelay = `${delay}ms`;
    return () => {
      card.style.removeProperty("animation-delay");
    };
  }, [delay]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, [menuOpen]);

  return (
    <Card
      className={cn(
        "motion-node-land relative gap-0 overflow-visible rounded-panel border-border py-0 shadow-none transition-[box-shadow,border-color] duration-(--motion-quick) ease-(--ease-out) hover:border-border-hover hover:shadow-product-hover motion-reduce:transition-none",
        variant === "map" ? "min-h-44" : "min-h-[12.75rem]",
      )}
      data-cluster-id={cluster.id}
      data-variant={variant}
      ref={cardRef}
    >
      <Link
        aria-label={t("clusters.card.openResources", { name: cluster.name })}
        className="flex min-h-full flex-1 flex-col rounded-panel outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={() => captureRouteMorph(document)}
        to={href}
      >
        <CardHeader className={cn("gap-0 px-4 pt-4 pb-0", onDisconnect && "pr-12")}>
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              className="brand-provider-tile grid size-[30px] shrink-0 place-items-center rounded-md text-primary-foreground"
              data-provider={cluster.provider}
            >
              <ClusterProviderIcon appearance="compact" className="text-primary-foreground [&_svg]:fill-current" provider={cluster.provider} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <CardTitle
                  className="truncate font-mono text-title-3 font-bold tracking-[-0.02em]"
                  title={cluster.name}
                >
                  {cluster.name}
                </CardTitle>
                {isProductionEnvironment(cluster.environment) ? (
                  <span className="shrink-0 rounded-sm border border-tint-warn-border bg-tint-warn-bg px-1.5 py-px text-micro font-semibold text-tint-warn-fg">
                    {t("clusters.card.environment.productionShort")}
                  </span>
                ) : null}
              </span>
              <p className="mt-0.5 truncate font-mono text-caption-2 text-caption-foreground">
                {platform} · {cluster.kubernetesVersion ?? t("clusters.card.kubernetesVersionUnavailable")}
              </p>
            </span>
            {incidents != null && incidents > 0 ? (
              <span className="shrink-0 rounded-full bg-destructive px-2.5 py-1 text-caption font-bold tabular-nums text-primary-foreground">
                {t("clusters.card.criticalLabel")} {formatNumber(incidents)}
              </span>
            ) : (
              <StatusPill label={tone === "healthy" ? t("clusters.card.active") : undefined} pulse={tone === "healthy"} tone={tone} />
            )}
          </div>
        </CardHeader>
        <CardContent className="grid flex-1 content-between gap-3 p-4">
          <p className="flex min-w-0 flex-nowrap items-center gap-x-3.5 overflow-hidden text-label tabular-nums text-muted-foreground" data-slot="cluster-card-counts">
            <span className="shrink-0 whitespace-nowrap">
              {t("clusters.card.nodesLabel")}{" "}
              <b className="font-mono text-foreground">
                {metricValue(usage?.nodesReady, formatNumber)}/{metricValue(usage?.nodesTotal ?? cluster.nodeCount, formatNumber)}
              </b>{" "}
              {t("clusters.card.readySuffix")}
            </span>
            <span className="shrink-0 whitespace-nowrap">
              {t("clusters.card.podsLabel")}{" "}
              <b className="font-mono text-foreground">{metricValue(usage?.podsTotal ?? cluster.podCount, formatNumber)}</b>
              {incidents != null && incidents > 0 ? (
                <b className="font-mono text-destructive"> · {t("clusters.card.criticalLabel")} {formatNumber(incidents)}</b>
              ) : null}
            </span>
            <span className="min-w-0 truncate whitespace-nowrap" title={`${t("clusters.card.namespacesLabel")} ${metricValue(cluster.namespaceCount, formatNumber)}`}>
              {t("clusters.card.namespacesLabel")}{" "}
              <b className="font-mono text-foreground">{metricValue(cluster.namespaceCount, formatNumber)}</b>
            </span>
          </p>
          <div className="grid gap-[7px]">
            <UsageBar
              label={t("home.metric.cpu")}
              unavailableLabel={t("common.value.unavailable")}
              value={usage?.cpuPercent ?? null}
            />
            <UsageBar
              label={t("clusters.card.memoryShort")}
              unavailableLabel={t("common.value.unavailable")}
              value={usage?.memoryPercent ?? null}
            />
          </div>
          {simulation ? (
            <p className="text-caption text-caption-foreground">
              {t("clusters.simulation.description")}
            </p>
          ) : disconnected ? (
            <p className="text-caption text-caption-foreground">
              {t(connectionReasonKey(cluster.connectionState))}
            </p>
          ) : null}
        </CardContent>
      </Link>

      {onDisconnect ? (
        <ClusterCardMenu
          disconnectStep={disconnectStep}
          menuButtonRef={menuButtonRef}
          menuOpen={menuOpen}
          menuRef={menuRef}
          name={cluster.name}
          onDisconnect={onDisconnect}
          onOpenChange={setMenuOpen}
        />
      ) : null}
      {disconnectStep !== null && onDisconnect ? (
        <button
          className="flex w-full min-w-0 items-center gap-2 border-t px-4 py-3 text-left text-xs font-semibold text-warning-foreground transition-colors hover:bg-status-warning/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
          onClick={onDisconnect}
          type="button"
        >
          <LoaderCircle aria-hidden="true" className="size-3.5 shrink-0 motion-safe:animate-spin" />
          <span className="truncate">{t("clusters.disconnect.cardProgress", { step: disconnectStep })}</span>
        </button>
      ) : null}
      {disconnectStep === null && disconnected && !simulation && onRefresh ? (
        <div className="border-t p-3">
          <Button className="w-full justify-center" onClick={onRefresh} size="sm" type="button" variant="outline">
            <RefreshCw aria-hidden="true" />
            {t("clusters.action.checkConnection")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
