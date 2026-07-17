import { RefreshCw, Square } from "lucide-react";

import { useOptionalPortForwardSessionsController } from "../../features/service-access/PortForwardSessionsProvider";
import { RefreshAction } from "../../motion/RefreshAction";
import { useI18n } from "../../shared/i18n";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";

export function PortForwardSessionsPanel() {
  const { t } = useI18n();
  const state = useOptionalPortForwardSessionsController();
  if (
    state === null
    || !state.available
    || state.frame.phase === "idle"
    || state.frame.phase === "loading"
  ) return null;
  if (state.frame.phase === "failed") {
    return (
      <Alert className="w-full max-w-[32rem]" variant="destructive">
        <RefreshCw aria-hidden="true" />
        <AlertDescription>
          {t("resources.serviceAccess.sessions.loadFailed")}
          <Button className="ml-2" onClick={state.refresh} size="sm" variant="outline">
            {t("common.action.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (state.frame.data.sessions.length === 0) return null;
  return (
    <section
      aria-labelledby="port-forward-sessions-title"
      className="grid w-full min-w-0 max-w-[32rem] gap-3 rounded-lg border bg-card p-3"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium" id="port-forward-sessions-title">
            {t("resources.serviceAccess.sessions.title")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("resources.serviceAccess.sessions.count", {
              count: state.frame.data.sessions.length,
            })}
          </p>
        </div>
        <RefreshAction
          hasFailed={state.frame.refreshFailure !== null}
          isRefreshing={state.frame.refreshing}
          label={t("common.action.refresh")}
          onRefresh={state.refresh}
          statusCopy={{
            cancelled: t("resources.serviceAccess.sessions.refresh.cancelled"),
            failed: t("resources.serviceAccess.sessions.refresh.failed"),
            pending: t("resources.serviceAccess.sessions.refresh.pending"),
            reconnecting: t("resources.serviceAccess.sessions.refresh.reconnecting"),
            succeeded: t("resources.serviceAccess.sessions.refresh.succeeded"),
          }}
        />
      </div>
      <ul className="grid min-w-0 gap-2">
        {state.frame.data.sessions.map((session) => (
          <li
            className="grid min-w-0 gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            key={session.id}
          >
            <div className="min-w-0">
              <p
                className="truncate text-sm font-medium"
                title={`${session.namespace}/${session.resourceName}`}
              >
                {session.namespace}/{session.resourceName}
              </p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>{t("resources.serviceAccess.sessions.localEndpoint", {
                  host: session.listenAddress,
                  port: session.localPort,
                })}</span>
                <span>{t("resources.serviceAccess.sessions.protocol", {
                  port: session.podPort,
                })}</span>
                <Badge variant={session.status === "running" ? "secondary" : "outline"}>
                  {t(`resources.serviceAccess.sessions.status.${session.status}`)}
                </Badge>
              </div>
              {session.error ? (
                <p className="mt-1 break-words text-xs text-destructive">{session.error}</p>
              ) : null}
              {session.exitCode !== null ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("resources.serviceAccess.sessions.exitCode", {
                    code: session.exitCode,
                  })}
                </p>
              ) : null}
            </div>
            {session.status === "error" || session.status === "stopped" ? (
              <Button
                disabled={state.stoppingId !== null || state.recreatingId !== null}
                onClick={() => void state.recreate(session.id)}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCw aria-hidden="true" />
                {state.recreatingId === session.id
                  ? t("resources.serviceAccess.sessions.recreating")
                  : t("resources.serviceAccess.sessions.recreate")}
              </Button>
            ) : (
              <Button
                disabled={state.stoppingId !== null || state.recreatingId !== null}
                onClick={() => void state.stop(session.id)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Square aria-hidden="true" />
                {state.stoppingId === session.id
                  ? t("resources.serviceAccess.sessions.stopping")
                  : t("resources.serviceAccess.sessions.stop")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {state.stopFailure ? (
        <p className="text-xs text-destructive" role="alert">
          {state.mutationFailureKind === "recreate"
            ? t("resources.serviceAccess.sessions.recreateFailed")
            : t("resources.serviceAccess.sessions.stopFailed")}
        </p>
      ) : null}
    </section>
  );
}
