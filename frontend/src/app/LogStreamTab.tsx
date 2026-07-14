import { useEffect, useRef, useState } from "react";

import type { BottomDockTab } from "../features/bottom-dock/bottomDockState";
import { useI18n } from "../shared/i18n";
import { Alert, AlertDescription } from "../shared/ui/primitives/alert";
import { Badge } from "../shared/ui/primitives/badge";
import { Button } from "../shared/ui/primitives/button";

export function LogStreamTab({
  onRetry,
  tab,
}: {
  onRetry: () => void;
  tab: BottomDockTab;
}) {
  const { formatDate, t } = useI18n();
  const viewport = useRef<HTMLDivElement>(null);
  const previousReceived = useRef(tab.received);
  const [following, setFollowing] = useState(true);
  const [pendingLines, setPendingLines] = useState(0);

  useEffect(() => {
    const added = Math.max(0, tab.received - previousReceived.current);
    previousReceived.current = tab.received;
    if (following) {
      const element = viewport.current;
      if (element) element.scrollTop = element.scrollHeight;
    } else if (added > 0) {
      setPendingLines((count) => count + added);
    }
  }, [following, tab.lines, tab.received]);

  const resumeFollowing = () => {
    setFollowing(true);
    setPendingLines(0);
    const element = viewport.current;
    if (element) element.scrollTop = element.scrollHeight;
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
      {tab.pods.length > 0 ? (
        <p className="truncate border-b px-3 py-1 text-xs text-muted-foreground">
          {t("shell.dock.pods", { count: tab.pods.length })}: {tab.pods.join(", ")}
        </p>
      ) : null}
      <div
        aria-live="off"
        aria-label={t("shell.dock.logs", { name: tab.target.name })}
        className="min-h-0 flex-1 overflow-auto overscroll-contain bg-background px-3 py-2 font-mono text-xs leading-5"
        onScroll={(event) => {
          const element = event.currentTarget;
          const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
          setFollowing(atBottom);
          if (atBottom) setPendingLines(0);
        }}
        ref={viewport}
        role="log"
      >
        {tab.lines.length === 0 ? (
          <p className="font-sans text-muted-foreground">{t("shell.dock.empty")}</p>
        ) : tab.lines.map((line) => (
          <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-2" key={line.id}>
            <time className="text-muted-foreground" dateTime={line.observedAt}>
              {formatTime(line.observedAt, formatDate)}
            </time>
            <span className="text-muted-foreground">{line.container ?? line.pod}</span>
            <code className="whitespace-pre-wrap break-all">{line.line}</code>
            {line.lineTruncated ? (
              <Badge className="col-start-3 justify-self-start" variant="outline">
                {t("shell.dock.truncated")}
              </Badge>
            ) : null}
          </div>
        ))}
      </div>
      {!following && pendingLines > 0 ? (
        <Button
          className="absolute right-4 bottom-4 rounded-full shadow-md"
          onClick={resumeFollowing}
          size="sm"
          type="button"
        >
          {t("shell.dock.newLines", { count: pendingLines })}
        </Button>
      ) : null}
    </div>
  );
}

function formatTime(
  value: string,
  formatDate: ReturnType<typeof useI18n>["formatDate"],
): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatDate(parsed, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
