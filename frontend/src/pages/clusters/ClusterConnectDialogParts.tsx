import {
  Check,
  Clipboard,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { ClusterConnectStage } from "../../features/clusters/clustersContract";
import type { I18nController } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import { Spinner } from "../../shared/ui/primitives/spinner";
import type { ConnectPhase } from "./useClusterConnectDialogController";

export function ConnectionCommandStep({
  copyState,
  connectionStage,
  elapsedSeconds,
  expiresAt,
  formatDate,
  installCommand,
  onCopy,
  onReissue,
  phase,
  providerLabel,
  t,
}: {
  copyState: "idle" | "copied" | "failed";
  connectionStage: ClusterConnectStage;
  elapsedSeconds: number;
  expiresAt: string | null;
  formatDate: I18nController["formatDate"];
  installCommand: string | null;
  onCopy: () => void;
  onReissue: () => void;
  phase: ConnectPhase;
  providerLabel: string;
  t: I18nController["t"];
}) {
  if (phase === "reissuing") {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-xl border bg-muted/25" role="status">
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" decorative />
          {t("clusters.connect.reissue.pending")}
        </span>
      </div>
    );
  }
  if (phase === "failed" || phase === "expired") {
    const expired = phase === "expired";
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>{t(expired ? "clusters.connect.expired.title" : "clusters.connect.failure.title")}</AlertTitle>
        <AlertDescription>
          <span className="block">
            {t(expired ? "clusters.connect.expired.description" : "clusters.connect.failure.description")}
          </span>
          {expired ? (
            <Button className="mt-3" onClick={onReissue} size="sm" type="button" variant="outline">
              {t("clusters.connect.reissue.action")}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }
  if (!installCommand) return null;
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="font-semibold">{t("clusters.connect.command.title")}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("clusters.connect.command.description")}
        </p>
      </div>

      <div
        className="min-w-0 max-w-full overflow-hidden rounded-xl border bg-muted/35"
        data-command-surface="true"
      >
        <div className="flex items-center justify-between gap-3 border-b px-3 py-2.5">
          <span className="min-w-0 truncate text-xs font-semibold text-muted-foreground">
            {t("clusters.connect.command.agentLabel", { provider: providerLabel })}
          </span>
          <Button
            aria-label={t(copyState === "copied" ? "clusters.connect.action.copied" : "clusters.connect.action.copy")}
            className="shrink-0 bg-background shadow-xs"
            onClick={onCopy}
            size="sm"
            type="button"
            variant="outline"
          >
            {copyState === "copied" ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
            <span>{t(copyState === "copied" ? "clusters.connect.action.copied" : "clusters.connect.action.copy")}</span>
          </Button>
        </div>
        <div
          aria-label={t("clusters.connect.command.title")}
          className="min-w-0 overflow-hidden"
          data-command-block="true"
          role="region"
          tabIndex={0}
        >
          <pre className="select-text whitespace-pre-wrap break-all px-4 py-3 font-mono text-xs leading-5 [overflow-wrap:anywhere]"><code>{installCommand}</code></pre>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-status-healthy" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("clusters.connect.security.outbound")}
        </p>
      </div>

      <ConnectionProgress elapsedSeconds={elapsedSeconds} stage={connectionStage} t={t} />

      <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/25 px-4 py-3" role="status">
        <span className="relative flex size-8 shrink-0 items-center justify-center" aria-hidden="true">
          <span className="absolute inline-flex size-7 animate-ping rounded-full bg-status-healthy/20 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2.5 rounded-full bg-status-healthy" />
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium">
          {t(phase === "finishing" ? "clusters.connect.progress.finalizing" : "clusters.connect.waiting")}
        </span>
        <Spinner className="size-4 shrink-0 text-data-accent" decorative />
      </div>

      <p aria-live="polite" className="sr-only">
        {copyState === "copied" ? t("clusters.connect.action.copied") : ""}
      </p>
      {copyState === "failed" ? (
        <p className="text-sm text-destructive" role="alert">{t("clusters.connect.copyFailure")}</p>
      ) : null}
      {expiresAt ? (
        <p className="text-xs text-muted-foreground">
          {t("clusters.connect.expires", { time: formatDate(new Date(expiresAt)) })}
        </p>
      ) : null}
    </div>
  );
}

const progressStages = [
  ["awaiting_install", "clusters.connect.progress.command"],
  ["agent_connected", "clusters.connect.progress.agent"],
  ["snapshot_received", "clusters.connect.progress.inventory"],
  ["ready", "clusters.connect.progress.ready"],
] as const;

function ConnectionProgress({
  elapsedSeconds,
  stage,
  t,
}: {
  elapsedSeconds: number;
  stage: ClusterConnectStage;
  t: I18nController["t"];
}) {
  const effectiveStage = stage === "token_issued" ? "awaiting_install" : stage;
  const currentIndex = Math.max(0, progressStages.findIndex(([value]) => value === effectiveStage));
  const statusKey = effectiveStage === "ready"
    ? "clusters.connect.progress.finalizing"
    : effectiveStage === "agent_connected"
      ? "clusters.connect.progress.waitInventory"
      : effectiveStage === "snapshot_received"
        ? "clusters.connect.progress.prepare"
        : "clusters.connect.progress.waitAgent";
  return (
    <div className="grid min-h-28 gap-3 rounded-xl border bg-card p-3" role="status">
      <ol aria-label={t("clusters.connect.progress.aria")} className="grid grid-cols-4 gap-2">
        {progressStages.map(([value, labelKey], index) => {
          const complete = index < currentIndex || effectiveStage === "ready";
          const active = index === currentIndex && effectiveStage !== "ready";
          return (
            <li
              className={cn(
                "motion-live-preview grid min-w-0 justify-items-center gap-1.5 rounded-lg border bg-muted/20 px-1.5 py-2 text-center",
                active && "border-data-accent/35 bg-data-accent/5",
              )}
              data-complete={complete || undefined}
              key={value}
            >
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full bg-muted text-muted-foreground",
                  complete && "bg-status-healthy/15 text-status-healthy",
                  active && "bg-data-accent/10 text-data-accent",
                )}
              >
                {complete
                  ? <Check aria-hidden="true" className="size-3" strokeWidth={3} />
                  : active
                    ? <Spinner className="size-3" decorative />
                    : <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
              </span>
              <span className="w-full truncate text-[0.6875rem] text-muted-foreground" title={t(labelKey)}>
                {t(labelKey)}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="truncate">{t(statusKey)}</span>
        <span className="shrink-0 tabular-nums">{t("clusters.connect.progress.elapsed", { seconds: elapsedSeconds })}</span>
      </div>
      {elapsedSeconds >= 10 ? (
        <p className="text-xs text-status-warning">{t("clusters.connect.progress.slow")}</p>
      ) : null}
    </div>
  );
}
