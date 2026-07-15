import { Check, Clipboard, LoaderCircle, TriangleAlert } from "lucide-react";
import type { ClusterConnectStage } from "../../features/clusters/clustersContract";
import type { I18nController } from "../../shared/i18n";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import type { ConnectPhase } from "./ClusterConnectDialog";

export function ConnectionCommandStep({
  copyState,
  connectionStage,
  elapsedSeconds,
  expiresAt,
  formatDate,
  installCommand,
  onCopy,
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
  phase: ConnectPhase;
  t: I18nController["t"];
}) {
  if (phase === "failed" || phase === "expired") {
    const expired = phase === "expired";
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>{t(expired ? "clusters.connect.expired.title" : "clusters.connect.failure.title")}</AlertTitle>
        <AlertDescription>
          {t(expired ? "clusters.connect.expired.description" : "clusters.connect.failure.description")}
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
      <pre className="max-h-48 overflow-auto rounded-xl border bg-muted p-4 text-xs"><code>{installCommand}</code></pre>
      <ConnectionProgress elapsedSeconds={elapsedSeconds} stage={connectionStage} t={t} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {t("clusters.connect.waiting")}
        </span>
        <Button onClick={onCopy} variant="outline">
          {copyState === "copied" ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
          {t(copyState === "copied" ? "clusters.connect.action.copied" : "clusters.connect.action.copy")}
        </Button>
      </div>
      {copyState === "failed" ? (
        <p className="text-sm text-destructive">{t("clusters.connect.copyFailure")}</p>
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
  const statusKey = effectiveStage === "agent_connected"
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
            <li className="grid min-w-0 justify-items-center gap-1 text-center" key={value}>
              <span className={complete
                ? "grid size-6 place-items-center rounded-full bg-status-healthy text-white"
                : active
                  ? "grid size-6 place-items-center rounded-full bg-primary/15 text-primary"
                  : "grid size-6 place-items-center rounded-full bg-muted text-muted-foreground"
              }>
                {complete ? <Check aria-hidden="true" className="size-3.5" /> : active
                  ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
                  : <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
              </span>
              <span className="w-full truncate text-[11px] text-muted-foreground" title={t(labelKey)}>
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
