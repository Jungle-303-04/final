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
      {tab.pods.length > 0 ? (
        <p className="truncate border-b px-3 py-1 text-xs text-muted-foreground">
          {t("shell.dock.pods", { count: tab.pods.length })}: {tab.pods.join(", ")}
        </p>
      ) : null}
      <LogViewer lines={tab.lines} received={tab.received} targetName={tab.target.name} />
    </div>
  );
}
