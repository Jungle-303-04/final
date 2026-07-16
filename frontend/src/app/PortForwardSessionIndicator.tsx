import { PlugZap, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";

import { alertEventResourceHref } from "../features/filters/alertEventResourceHref";
import { usePortForwardSessionsController } from "../features/service-access/PortForwardSessionsProvider";
import type {
  PortForwardSession,
  PortForwardSessionStatus,
} from "../features/service-access/portForwardSessionContract";
import { useI18n } from "../shared/i18n";
import { cn } from "../shared/lib/cn";
import { Badge } from "../shared/ui/primitives/badge";
import { Button } from "../shared/ui/primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../shared/ui/primitives/popover";

const STATUS_KEYS = {
  error: "resources.serviceAccess.sessions.status.error",
  running: "resources.serviceAccess.sessions.status.running",
  starting: "resources.serviceAccess.sessions.status.starting",
  stopped: "resources.serviceAccess.sessions.status.stopped",
} as const;

export function PortForwardSessionIndicator({
  resourcesAvailable,
}: {
  resourcesAvailable: boolean;
}) {
  const controller = usePortForwardSessionsController();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const { t } = useI18n();

  if (!controller.available || !resourcesAvailable) return null;
  if (controller.frame.phase === "idle" || controller.frame.phase === "loading") return null;

  if (controller.frame.phase === "failed") {
    const label = t("resources.serviceAccess.sessions.loadFailed");
    return (
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={(
            <Button aria-label={label} size="icon-sm" variant="destructive" />
          )}
        >
          <TriangleAlert aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="end" className="grid w-72 gap-3 p-3">
          <p className="text-sm text-destructive" role="alert">{label}</p>
          <Button onClick={controller.refresh} size="sm" type="button" variant="outline">
            {t("common.action.retry")}
          </Button>
        </PopoverContent>
      </Popover>
    );
  }

  const sessions = controller.frame.data.sessions;
  if (sessions.length === 0) return null;
  const counts = sessionCounts(sessions);
  const summary = t("shell.portForward.summary", counts);

  return (
    <>
      <output aria-atomic="true" aria-live="polite" className="sr-only">
        {summary}
      </output>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={(
            <Button
              aria-label={summary}
              className="relative gap-1.5 px-2"
              size="sm"
              variant={counts.failed > 0 ? "destructive" : "ghost"}
            />
          )}
        >
          <PlugZap
            aria-hidden="true"
            className={cn(
              controller.frame.refreshing && "motion-safe:animate-pulse motion-reduce:animate-none",
            )}
          />
          <span aria-hidden="true" className="tabular-nums">{sessions.length}</span>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          aria-labelledby={titleId}
          className="grid w-[min(24rem,calc(100vw-2rem))] gap-3 p-3"
        >
          <div className="grid gap-1">
            <h2 className="text-sm font-semibold" id={titleId}>
              {t("resources.serviceAccess.sessions.title")}
            </h2>
            <p className="text-xs text-muted-foreground">{summary}</p>
          </div>
          {controller.frame.refreshFailure ? (
            <p className="text-xs text-destructive" role="status">
              {t("resources.serviceAccess.sessions.loadFailed")}
            </p>
          ) : null}
          <ul className="grid max-h-80 gap-2 overflow-y-auto">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  aria-label={t("shell.portForward.manage", {
                    kind: session.resourceKind,
                    name: session.resourceName,
                    namespace: session.namespace,
                  })}
                  className="grid min-w-0 gap-1 rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
                  onClick={() => setOpen(false)}
                  to={sessionResourceHref(session)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={statusDotClass(session.status)}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {session.namespace}/{session.resourceName}
                    </span>
                    <Badge variant={statusBadgeVariant(session.status)}>
                      {t(STATUS_KEYS[session.status])}
                    </Badge>
                  </span>
                  <span className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{session.resourceKind}</span>
                    <span>{t("resources.serviceAccess.sessions.localEndpoint", {
                      host: session.listenAddress,
                      port: session.localPort,
                    })}</span>
                    <span>{t("resources.serviceAccess.sessions.protocol", {
                      port: session.podPort,
                    })}</span>
                  </span>
                  {session.error ? (
                    <span className="break-words text-xs text-destructive">{session.error}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </>
  );
}

function sessionCounts(sessions: readonly PortForwardSession[]) {
  return sessions.reduce((counts, session) => ({
    active: counts.active + (session.status === "running" || session.status === "starting" ? 1 : 0),
    failed: counts.failed + (session.status === "error" ? 1 : 0),
    stopped: counts.stopped + (session.status === "stopped" ? 1 : 0),
  }), { active: 0, failed: 0, stopped: 0 });
}

function sessionResourceHref(session: PortForwardSession): string {
  return alertEventResourceHref({
    cluster: session.clusterId,
    kind: session.resourceKind,
    name: session.resourceName,
    namespace: session.namespace,
  });
}

function statusBadgeVariant(status: PortForwardSessionStatus): "destructive" | "outline" | "warning" {
  if (status === "error") return "destructive";
  if (status === "starting") return "warning";
  return "outline";
}

function statusDotClass(status: PortForwardSessionStatus): string {
  return cn(
    "size-1.5 shrink-0 rounded-full bg-status-unknown transition-colors motion-reduce:transition-none",
    status === "running" && "bg-status-healthy",
    status === "starting" && "bg-status-warning motion-safe:animate-pulse motion-reduce:animate-none",
    status === "error" && "bg-destructive",
    status === "stopped" && "bg-status-stale",
  );
}
