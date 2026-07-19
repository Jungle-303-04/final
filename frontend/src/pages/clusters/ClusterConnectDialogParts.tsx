import { Check, Clipboard, TriangleAlert } from "lucide-react";
import type { ClusterConnectStage } from "../../features/clusters/clustersContract";
import type { I18nController } from "../../shared/i18n";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import { Spinner } from "../../shared/ui/primitives/spinner";
import {
  ConnectStages,
  type ConnectStageState,
  type ConnectStageTriplet,
} from "../../shared/ui/connect";
import type { ConnectPhase } from "./ClusterConnectDialogTypes";

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
  t: I18nController["t"];
}) {
  if (phase === "reissuing") {
    return (
      <div className="flex min-h-36 items-center justify-center rounded-xl border bg-card" role="status">
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
        <p className="text-sm text-muted-foreground">{t("clusters.connect.command.description")}</p>
      </div>
      <div
        className="flex min-w-0 max-w-full items-start gap-2 overflow-hidden rounded-xl border bg-muted p-2"
        data-command-surface="true"
      >
        <div
          aria-label={t("clusters.connect.command.title")}
          className="min-w-0 flex-1 overflow-hidden rounded-lg bg-background/70"
          data-command-block="true"
          role="region"
          tabIndex={0}
        >
          <pre className="select-text whitespace-pre-wrap break-all px-3 py-2.5 text-xs leading-5 [overflow-wrap:anywhere]"><code>{installCommand}</code></pre>
        </div>
        <Button
          aria-label={t(copyState === "copied" ? "clusters.connect.action.copied" : "clusters.connect.action.copy")}
          className="shrink-0 bg-background shadow-xs"
          onClick={onCopy}
          size="sm"
          type="button"
          variant="outline"
        >
          {copyState === "copied" ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
          <span className="hidden sm:inline">
            {t(copyState === "copied" ? "clusters.connect.action.copied" : "clusters.connect.action.copy")}
          </span>
        </Button>
      </div>
      <ConnectionProgress elapsedSeconds={elapsedSeconds} stage={connectionStage} t={t} />
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner className="size-4" decorative />
          {t(phase === "finishing" ? "clusters.connect.progress.finalizing" : "clusters.connect.waiting")}
        </span>
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
  const statusKey = effectiveStage === "ready"
    ? "clusters.connect.progress.finalizing"
    : effectiveStage === "agent_connected"
      ? "clusters.connect.progress.waitInventory"
      : effectiveStage === "snapshot_received"
        ? "clusters.connect.progress.prepare"
        : "clusters.connect.progress.waitAgent";
  const stages = connectionStages(effectiveStage, t);
  return (
    <div className="grid min-h-28 gap-3 rounded-xl border bg-card p-3" role="status">
      <ConnectStages ariaLabel={t("clusters.connect.progress.aria")} stages={stages} />
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

function connectionStages(
  stage: ClusterConnectStage,
  t: I18nController["t"],
): ConnectStageTriplet {
  const order: readonly ClusterConnectStage[] = [
    "awaiting_install",
    "agent_connected",
    "snapshot_received",
    "ready",
  ];
  const current = Math.max(0, order.indexOf(stage));
  const failed = stage === "error" || stage === "expired";
  const state = (index: number): ConnectStageState => {
    if (failed) return index === Math.min(current, 2) ? "error" : "pending";
    if (stage === "ready" || index < current) return "complete";
    return index === current ? "active" : "pending";
  };
  return [
    {
      id: "install",
      label: t("clusters.connect.progress.command"),
      state: state(0),
    },
    {
      id: "handshake",
      label: t("clusters.connect.progress.agent"),
      state: state(1),
    },
    {
      id: "sync",
      label: t("clusters.connect.progress.inventory"),
      state: state(2),
    },
  ];
}
