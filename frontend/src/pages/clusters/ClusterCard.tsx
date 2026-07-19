import { Ellipsis, LoaderCircle, RefreshCw, Unplug } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Link } from "react-router-dom";

import { ClusterProviderIcon } from "../../features/cluster-scope/ClusterProviderIcon";
import type {
  HomeClusterChoice,
  HomeClusterProvider,
  HomeConnectionState,
  HomeUsageSnapshot,
} from "../../features/home/homeContract";
import { captureRouteMorph } from "../../motion/useCameraMorph";
import { MeterFill, type MeterTone } from "../../shared/ui/meter/MeterFill";
import { STAGGER_MS, useStagger } from "../../motion/useStagger";
import { useI18n, type MessageKey } from "../../shared/i18n";
import { StatusPill, type StatusTone } from "../../shared/ui/status";
import { Button } from "../../shared/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { cn } from "@/shared/lib/cn";
import type { DisconnectPhase } from "./ClusterDisconnectDialog";
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
        variant === "map" ? "min-h-44" : "min-h-48",
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
          <p className="flex min-w-0 flex-wrap gap-x-3.5 gap-y-1 text-label tabular-nums text-muted-foreground" data-slot="cluster-card-counts">
            <span>
              {t("clusters.card.nodesLabel")}{" "}
              <b className="font-mono text-foreground">
                {metricValue(usage?.nodesReady, formatNumber)}/{metricValue(usage?.nodesTotal ?? cluster.nodeCount, formatNumber)}
              </b>{" "}
              {t("clusters.card.readySuffix")}
            </span>
            <span>
              {t("clusters.card.podsLabel")}{" "}
              <b className="font-mono text-foreground">{metricValue(usage?.podsTotal ?? cluster.podCount, formatNumber)}</b>
              {incidents != null && incidents > 0 ? (
                <b className="font-mono text-destructive"> · {t("clusters.card.criticalLabel")} {formatNumber(incidents)}</b>
              ) : null}
            </span>
            <span>
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

function clusterPlatformLabel(provider: HomeClusterProvider): string {
  if (provider === "eks") return "Amazon EKS";
  if (provider === "aks") return "Azure AKS";
  if (provider === "gke") return "Google GKE";
  if (provider === "kind") return "kind";
  if (provider === "onprem") return "On-premises Kubernetes";
  return "Kubernetes";
}

function UsageBar({
  label,
  unavailableLabel,
  value,
}: {
  label: string;
  unavailableLabel: string;
  value: number | null;
}) {
  const tone: MeterTone = value == null
    ? "unknown"
    : value >= 90
      ? "critical"
      : value >= 75
        ? "warning"
        : "healthy";
  return (
    <div
      aria-label={`${label} ${value == null ? unavailableLabel : `${value}%`}`}
      className="flex min-w-0 items-center gap-2"
      role="img"
    >
      <span className="w-[34px] shrink-0 text-micro font-semibold tracking-[0.05em] text-caption-foreground">
        {label}
      </span>
      <span className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/[0.07]">
        <MeterFill className="block h-full rounded-full" tone={tone} value={value ?? 0} />
      </span>
      <span className="w-[38px] shrink-0 text-right font-mono text-label-2 font-bold tabular-nums text-foreground">
        {value == null ? "—" : `${value}%`}
      </span>
    </div>
  );
}

function ClusterCardMenu({
  disconnectStep,
  menuButtonRef,
  menuOpen,
  menuRef,
  name,
  onDisconnect,
  onOpenChange,
}: {
  disconnectStep: number | null;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  menuOpen: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  name: string;
  onDisconnect: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="absolute top-2 right-2 z-10" ref={menuRef}>
      <Button
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={t("clusters.card.actions", { name })}
        onClick={() => onOpenChange(!menuOpen)}
        ref={menuButtonRef}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Ellipsis aria-hidden="true" />
      </Button>
      {menuOpen ? (
        <div
          aria-label={t("clusters.card.actions", { name })}
          className="absolute top-full right-0 mt-1 min-w-36 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
          role="menu"
        >
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-destructive outline-none hover:bg-destructive/10 focus-visible:bg-destructive/10"
            onClick={() => {
              onOpenChange(false);
              onDisconnect();
            }}
            role="menuitem"
            type="button"
          >
            <Unplug aria-hidden="true" className="size-3.5" />
            {disconnectStep === null
              ? t("clusters.action.disconnect")
              : t("clusters.disconnect.resume")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function disconnectProgressStep(phase: DisconnectPhase | undefined): number | null {
  if (phase === "submitting") return 1;
  if (phase === "uninstalling" || phase === "cleanup-required") return 2;
  return null;
}

function metricValue(
  value: number | null | undefined,
  formatNumber: (value: number) => string,
): string {
  return value == null ? "—" : formatNumber(value);
}

function connectionReasonKey(state: HomeConnectionState): MessageKey {
  if (state === "pending") return "clusters.connection.pendingReason";
  if (state === "stale") return "clusters.connection.staleReason";
  if (state === "offline") return "clusters.connection.offlineReason";
  return "clusters.connection.unknownReason";
}

function isProductionEnvironment(environment: string): boolean {
  const normalized = environment.trim().toLowerCase();
  return normalized === "prod" || normalized === "production";
}
