import { Activity, CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../shared/ui/primitives/dialog";
import { Spinner } from "../../shared/ui/primitives/spinner";
import {
  EMPTY_RUNTIME_STATUS_PORT,
  type RuntimeDiagnostics,
  type RuntimeStatusAvailability,
  type RuntimeStatusPort,
} from "./runtimeStatusContract";

interface RuntimeDiagnosticsDialogProps {
  port?: RuntimeStatusPort;
}

type DiagnosticsState =
  | { phase: "idle" | "loading" | "error" }
  | { phase: "ready"; value: RuntimeDiagnostics };

export function RuntimeDiagnosticsDialog({
  port = EMPTY_RUNTIME_STATUS_PORT,
}: RuntimeDiagnosticsDialogProps) {
  const { formatDate, formatNumber, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DiagnosticsState>({ phase: "idle" });

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    void port.loadDiagnostics(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setState({ phase: "ready", value });
      },
      () => {
        if (!controller.signal.aborted) setState({ phase: "error" });
      },
    );
    return () => controller.abort();
  }, [attempt, open, port]);

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setState({ phase: "loading" });
      }}
      open={open}
    >
      <DialogTrigger
        render={(
          <Button
            aria-label={t("shell.diagnostics.open")}
            size="icon"
            variant="ghost"
          />
        )}
      >
        <Activity aria-hidden="true" />
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl"
        closeLabel={t("shell.diagnostics.close")}
      >
        <DialogHeader>
          <DialogTitle>{t("shell.diagnostics.title")}</DialogTitle>
          <DialogDescription>{t("shell.diagnostics.description")}</DialogDescription>
        </DialogHeader>
        {state.phase === "loading" || state.phase === "idle" ? (
          <div aria-live="polite" className="grid min-h-40 place-items-center">
            <Spinner aria-label={t("shell.diagnostics.loading")} />
          </div>
        ) : null}
        {state.phase === "error" ? (
          <div className="grid min-h-40 place-items-center gap-3 rounded-lg border border-dashed p-6 text-center">
            <CircleAlert aria-hidden="true" className="size-6 text-destructive" />
            <p className="font-medium">{t("shell.diagnostics.failed")}</p>
            <Button
              onClick={() => {
                setState({ phase: "loading" });
                setAttempt((value) => value + 1);
              }}
              variant="outline"
            >
              {t("common.action.retry")}
            </Button>
          </div>
        ) : null}
        {state.phase === "ready" ? (
          <DiagnosticsContent
            diagnostics={state.value}
            formatDate={formatDate}
            formatNumber={formatNumber}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DiagnosticsContent({
  diagnostics,
  formatDate,
  formatNumber,
}: {
  diagnostics: RuntimeDiagnostics;
  formatDate: ReturnType<typeof useI18n>["formatDate"];
  formatNumber: ReturnType<typeof useI18n>["formatNumber"];
}) {
  const { t } = useI18n();
  const value = (input: number | null) => input === null
    ? t("common.value.unavailable")
    : formatNumber(input);
  const date = (input: string | null) => {
    if (input === null) return t("common.value.unavailable");
    const parsed = Date.parse(input);
    return Number.isNaN(parsed) ? input : formatDate(parsed, { dateStyle: "medium", timeStyle: "medium" });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AvailabilityBadge availability={diagnostics.completeness === "complete" ? "available" : "partial"} />
        <span className="text-xs text-muted-foreground">
          {t("shell.diagnostics.observed", { date: date(diagnostics.observedAt) })}
        </span>
      </div>
      <DiagnosticsSection title={t("shell.diagnostics.runtime")}>
        <p className="font-medium">
          {diagnostics.runtime.pythonImplementation} {diagnostics.runtime.pythonVersion}
        </p>
        <MetricGrid values={[
          [t("shell.diagnostics.process"), value(diagnostics.runtime.processId)],
          [t("shell.diagnostics.cpu"), value(diagnostics.runtime.cpuCount)],
          [t("shell.diagnostics.threads"), value(diagnostics.runtime.threadCount)],
          [t("shell.diagnostics.uptime"), t("shell.diagnostics.seconds", {
            count: formatNumber(Math.round(diagnostics.runtime.uptimeSeconds)),
          })],
        ]} />
      </DiagnosticsSection>
      <DiagnosticsSection
        status={<AvailabilityBadge availability={diagnostics.eventPipeline.availability} />}
        title={t("shell.diagnostics.events")}
      >
        <MetricGrid values={[
          [t("shell.diagnostics.deadLetters"), value(diagnostics.eventPipeline.openDeadLetters)],
          [t("shell.diagnostics.outbox"), value(diagnostics.eventPipeline.outboxPending)],
        ]} />
        {diagnostics.eventPipeline.processingStatuses.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {diagnostics.eventPipeline.processingStatuses.map((status) => (
              <Badge key={status.status} variant="secondary">
                {status.status}: {formatNumber(status.count)}
              </Badge>
            ))}
          </div>
        ) : null}
        {diagnostics.eventPipeline.consumerLag.map((lag) => (
          <p className="text-xs text-muted-foreground" key={`${lag.consumer}:${lag.subject}`}>
            {lag.consumer} · {lag.subject} · {t("shell.diagnostics.pending", { count: formatNumber(lag.pending) })}
          </p>
        ))}
        <ReasonCodes codes={diagnostics.eventPipeline.reasonCodes} />
      </DiagnosticsSection>
      <DiagnosticsSection
        status={<AvailabilityBadge availability={diagnostics.timeline.availability} />}
        title={t("shell.diagnostics.timeline")}
      >
        <MetricGrid values={[
          [t("shell.diagnostics.eventCount"), value(diagnostics.timeline.eventCount)],
          [t("shell.diagnostics.highWater"), value(diagnostics.timeline.highWaterSequence)],
          [t("shell.diagnostics.retainedFrom"), value(diagnostics.timeline.retainedFromSequence)],
          [t("shell.diagnostics.newest"), date(diagnostics.timeline.newestOccurredAt)],
        ]} />
        <ReasonCodes codes={diagnostics.timeline.reasonCodes} />
      </DiagnosticsSection>
      <DiagnosticsSection
        status={<AvailabilityBadge availability={diagnostics.agentCollection.availability} />}
        title={t("shell.diagnostics.agents")}
      >
        {diagnostics.agentCollection.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("shell.diagnostics.noAgents")}</p>
        ) : diagnostics.agentCollection.items.map((agent) => (
          <div className="rounded-lg border p-3" key={agent.clusterId}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{agent.name}</p>
              <Badge variant={agent.connectionStatus === "online" ? "secondary" : "warning"}>
                {agent.connectionStatus}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {agent.environment || t("common.value.unavailable")} · {agent.registrationStatus}
              {agent.latestInventory === null
                ? ""
                : ` · ${t("shell.diagnostics.resources", { count: formatNumber(agent.latestInventory.resourceCount) })}`}
            </p>
            {agent.capabilities.length > 0 ? (
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {agent.capabilities.join(" · ")}
              </p>
            ) : null}
          </div>
        ))}
        <ReasonCodes codes={diagnostics.agentCollection.reasonCodes} />
      </DiagnosticsSection>
      <ReasonCodes codes={diagnostics.reasonCodes} />
    </div>
  );
}

function DiagnosticsSection({
  children,
  status,
  title,
}: {
  children: React.ReactNode;
  status?: React.ReactNode;
  title: string;
}) {
  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {status}
      </div>
      {children}
    </section>
  );
}

function MetricGrid({ values }: { values: ReadonlyArray<readonly [string, string]> }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {values.map(([label, value]) => (
        <div className="min-w-0 rounded-lg bg-muted/60 p-2" key={label}>
          <dt className="truncate text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AvailabilityBadge({ availability }: { availability: RuntimeStatusAvailability }) {
  const variant = availability === "available"
    ? "secondary"
    : availability === "partial" ? "warning" : "destructive";
  return <Badge variant={variant}>{availability}</Badge>;
}

function ReasonCodes({ codes }: { codes: readonly string[] }) {
  if (codes.length === 0) return null;
  return <p className="break-words text-xs text-muted-foreground">{codes.join(" · ")}</p>;
}
