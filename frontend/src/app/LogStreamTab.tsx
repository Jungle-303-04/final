import { useState } from "react";
import type { BottomDockTab } from "../features/bottom-dock/bottomDockState";
import { LogViewer } from "../features/log-viewer/LogViewer";
import { useI18n } from "../shared/i18n";
import { Alert, AlertDescription } from "../shared/ui/primitives/alert";
import { Button } from "../shared/ui/primitives/button";

export function LogStreamTab({
  onRetry,
  tab,
}: {
  onRetry: () => void;
  tab: BottomDockTab;
}) {
  const { t } = useI18n();
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const recovery = tab.lines.length === 0 ? tab.diagnostic?.recovery ?? null : null;

  const copyRecovery = async () => {
    if (!recovery) return;
    try {
      await navigator.clipboard.writeText(recovery.command);
      setCopiedCommand(recovery.command);
    } catch {
      setCopiedCommand(null);
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {tab.dropped > 0 ? (
        <p className="border-b bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          {t("shell.dock.dropped", { count: tab.dropped })}
        </p>
      ) : null}
      {tab.status === "failed" ? (
        <Alert className="m-3" variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>{t("shell.dock.failed")}</span>
            {tab.retryable ? (
              <Button onClick={onRetry} size="sm" type="button" variant="outline">
                {t("shell.dock.retry")}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {tab.status === "ended" && tab.endReason ? (
        <p className="border-b px-3 py-1 text-xs text-muted-foreground">
          {t("shell.dock.endReason", { reason: tab.endReason })}
        </p>
      ) : null}
      {tab.status === "ended" && tab.lines.length === 0 && tab.diagnostic ? (
        <Alert className="m-3">
          <AlertDescription className="grid gap-2">
            <span>{t(tab.diagnostic.code === "no_matching_pods"
              ? "shell.dock.diagnostic.noPods"
              : "shell.dock.diagnostic.noLines")}</span>
            {recovery ? (
              <div className="grid gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("shell.dock.diagnostic.cluster", { cluster: recovery.clusterId })}
                </span>
                <code className="overflow-x-auto rounded bg-muted px-2 py-1 text-xs">
                  {recovery.command}
                </code>
                <div>
                  <Button onClick={() => void copyRecovery()} size="sm" type="button" variant="outline">
                    {copiedCommand === recovery.command
                      ? t("shell.dock.diagnostic.copied")
                      : t("shell.dock.diagnostic.copy")}
                  </Button>
                </div>
              </div>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {tab.pods.length > 0 ? (
        <p className="truncate border-b px-3 py-1 text-xs text-muted-foreground">
          {t("shell.dock.pods", { count: tab.pods.length })}: {tab.pods.join(", ")}
        </p>
      ) : null}
      {tab.containers.length > 0 ? (
        <p className="truncate border-b px-3 py-1 text-xs text-muted-foreground">
          {t("shell.dock.containers", { count: tab.containers.length })}:{" "}
          {tab.containers.join(", ")}
        </p>
      ) : null}
      <LogViewer lines={tab.lines} received={tab.received} targetName={tab.target.name} />
    </div>
  );
}
