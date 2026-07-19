import { Ellipsis, Unplug } from "lucide-react";
import type { RefObject } from "react";

import type {
  HomeClusterProvider,
  HomeConnectionState,
} from "../../features/home/homeContract";
import { useI18n, type MessageKey } from "../../shared/i18n";
import { MeterFill, type MeterTone } from "../../shared/ui/meter/MeterFill";
import { Button } from "../../shared/ui/primitives/button";
import type { DisconnectPhase } from "./ClusterDisconnectDialog";

export function clusterPlatformLabel(provider: HomeClusterProvider): string {
  if (provider === "eks") return "Amazon EKS";
  if (provider === "aks") return "Azure AKS";
  if (provider === "gke") return "Google GKE";
  if (provider === "kind") return "kind";
  if (provider === "onprem") return "On-premises Kubernetes";
  return "Kubernetes";
}

export function UsageBar({
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

export function ClusterCardMenu({
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

export function disconnectProgressStep(phase: DisconnectPhase | undefined): number | null {
  if (phase === "submitting") return 1;
  if (phase === "uninstalling" || phase === "cleanup-required") return 2;
  return null;
}

export function metricValue(
  value: number | null | undefined,
  formatNumber: (value: number) => string,
): string {
  return value == null ? "—" : formatNumber(value);
}

export function connectionReasonKey(state: HomeConnectionState): MessageKey {
  if (state === "pending") return "clusters.connection.pendingReason";
  if (state === "stale") return "clusters.connection.staleReason";
  if (state === "offline") return "clusters.connection.offlineReason";
  return "clusters.connection.unknownReason";
}

export function isProductionEnvironment(environment: string): boolean {
  const normalized = environment.trim().toLowerCase();
  return normalized === "prod" || normalized === "production";
}
