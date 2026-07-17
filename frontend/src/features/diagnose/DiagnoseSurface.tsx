import {
  ArrowLeft,
  RotateCw,
  Send,
  Square,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  useI18n,
  type MessageKey,
  type TranslationFunction,
} from "../../shared/i18n";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import type {
  DiagnoseEvent,
  DiagnosePort,
  DiagnoseRun,
} from "./diagnoseContract";

const ACTIVE_STATUSES = new Set(["queued", "running", "awaiting_confirmation"]);

export function DiagnoseSurface({
  activeRunId,
  onActiveRunChange,
  port,
}: {
  activeRunId: string | null;
  onActiveRunChange(runId: string | null): void;
  port: DiagnosePort;
}) {
  const { t } = useI18n();
  const [runs, setRuns] = useState<DiagnoseRun[]>([]);
  const [eventState, setEventState] = useState<{
    runId: string | null;
    events: DiagnoseEvent[];
  }>({ runId: null, events: [] });
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState(false);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const activeRun = useMemo(
    () => runs.find((run) => run.runId === activeRunId) ?? null,
    [activeRunId, runs],
  );
  const events = eventState.runId === activeRunId ? eventState.events : [];

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await port.listRuns(40, signal);
      setRuns(result.runs);
      setFailure(false);
    } catch (error) {
      if (!isAbortError(error)) setFailure(true);
    } finally {
      setLoading(false);
    }
  }, [port]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void refresh(controller.signal));
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!runs.some((run) => ACTIVE_STATUSES.has(run.status))) return undefined;
    const timer = window.setInterval(() => void refresh(), 4_000);
    return () => window.clearInterval(timer);
  }, [refresh, runs]);

  useEffect(() => {
    if (activeRunId === null) return undefined;
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const event of port.subscribeEvents(activeRunId, {
          signal: controller.signal,
        })) {
          setEventState((current) => ({
            runId: activeRunId,
            events: appendOrdered(
              current.runId === activeRunId ? current.events : [],
              event,
            ),
          }));
          if (event.kind === "closed" || event.kind === "error") void refresh();
        }
      } catch (error) {
        if (!isAbortError(error)) setFailure(true);
      }
    })();
    return () => controller.abort();
  }, [activeRunId, port, refresh]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [events.length]);

  if (activeRunId === null) {
    return (
      <div className="grid gap-3" data-slot="diagnose-home">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">
              {t("diagnose.history.title")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("diagnose.history.description")}
            </p>
          </div>
          <Button
            aria-label={t("diagnose.history.clear")}
            disabled={!runs.some((run) => !ACTIVE_STATUSES.has(run.status))}
            onClick={() => void clearHistory()}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
        {failure ? <FailureAlert /> : null}
        {loading ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("diagnose.history.loading")}
          </p>
        ) : runs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {t("diagnose.history.empty")}
          </p>
        ) : (
          <div className="grid gap-2">
            {runs.map((run) => (
              <button
                className="grid min-w-0 gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                key={run.runId}
                onClick={() => onActiveRunChange(run.runId)}
                type="button"
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {run.target.kind}/{run.target.name}
                  </span>
                  <RunStatus status={run.status} />
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {run.target.clusterId}
                  {run.target.namespace ? ` · ${run.target.namespace}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-slot="diagnose-investigation">
      <div className="flex items-center gap-2">
        <Button
          aria-label={t("diagnose.run.back")}
          onClick={() => onActiveRunChange(null)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">
            {activeRun
              ? `${activeRun.target.kind}/${activeRun.target.name}`
              : t("diagnose.run.loading")}
          </h3>
          {activeRun ? <RunStatus status={activeRun.status} /> : null}
        </div>
        <Button
          aria-label={t("common.action.refresh")}
          onClick={() => void refresh()}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <RotateCw aria-hidden="true" />
        </Button>
      </div>
      {failure ? <FailureAlert /> : null}
      <div
        aria-live="polite"
        className="min-h-48 flex-1 overflow-y-auto rounded-lg border bg-muted/20 p-3"
        role="log"
      >
        <div className="grid gap-3">
          {events.length === 0 ? (
            <p className="animate-pulse text-sm text-muted-foreground motion-reduce:animate-none">
              {t("diagnose.run.connecting")}
            </p>
          ) : events.map((event) => (
            <DiagnoseEventRow event={event} key={event.sequence} />
          ))}
          <div aria-hidden="true" ref={endRef} />
        </div>
      </div>
      {activeRun && ACTIVE_STATUSES.has(activeRun.status) ? (
        <Button
          disabled={pending}
          onClick={() => void stop()}
          type="button"
          variant="outline"
        >
          <Square aria-hidden="true" />
          {t("diagnose.run.stop")}
        </Button>
      ) : (
        <form className="relative" onSubmit={submit}>
          <textarea
            aria-label={t("diagnose.followUp.label")}
            className="min-h-20 w-full resize-none rounded-lg border bg-transparent px-3 py-2 pb-11 pr-12 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={pending || activeRun?.status !== "completed"}
            maxLength={16_000}
            onChange={(event) => setQuestion(event.currentTarget.value)}
            placeholder={t("diagnose.followUp.placeholder")}
            value={question}
          />
          <Button
            aria-label={t("diagnose.followUp.send")}
            className="absolute bottom-2 right-2"
            disabled={pending || activeRun?.status !== "completed" || !question.trim()}
            size="icon-sm"
            type="submit"
          >
            <Send aria-hidden="true" />
          </Button>
        </form>
      )}
    </div>
  );

  async function clearHistory() {
    setPending(true);
    try {
      await port.clearFinished();
      await refresh();
    } catch {
      setFailure(true);
    } finally {
      setPending(false);
    }
  }

  async function stop() {
    if (!activeRun) return;
    setPending(true);
    try {
      await port.stopRun(activeRun.runId);
      await refresh();
    } catch {
      setFailure(true);
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!activeRun || !question.trim() || pending) return;
    setPending(true);
    try {
      await port.addTurn(activeRun.runId, question.trim());
      setQuestion("");
      await refresh();
    } catch {
      setFailure(true);
    } finally {
      setPending(false);
    }
  }
}

function DiagnoseEventRow({
  event,
}: {
  event: DiagnoseEvent;
}) {
  const { t } = useI18n();
  const question = text(event.payload.question);
  const answer = text(event.payload.answer);
  const status = text(event.payload.status);
  const reason = text(event.payload.reason);
  if (event.kind === "turn" && question) {
    return (
      <p
        className="motion-diagnose-entry ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
        data-kind={event.kind}
      >
        {question}
      </p>
    );
  }
  if (event.kind === "verdict" && answer) {
    return (
      <article
        className="motion-diagnose-verdict mr-auto grid w-fit max-w-[95%] gap-2 rounded-2xl rounded-bl-sm border bg-card px-3 py-3"
        data-kind={event.kind}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</p>
        <EvidenceList evidence={event.payload.evidence} />
      </article>
    );
  }
  return (
    <div
      className="motion-diagnose-entry flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
      data-kind={event.kind}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className={event.kind === "thinking"
        ? "motion-diagnose-thinking break-words"
        : "break-words"}
      >
        {status || reason || eventLabel(event.kind, t)}
      </span>
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: unknown }) {
  const { t } = useI18n();
  if (!Array.isArray(evidence) || evidence.length === 0) return null;
  return (
    <div className="grid gap-1 border-t pt-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t("shell.ai.evidence")}
      </p>
      {evidence.flatMap((value, index) => {
        if (!isRecord(value)) return [];
        const link = text(value.link);
        const label = text(value.label);
        if (!link || !label || !link.startsWith("/")) return [];
        return [(
          <a className="truncate text-xs text-primary hover:underline" href={link} key={`${link}:${index}`}>
            {label}
          </a>
        )];
      })}
    </div>
  );
}

function RunStatus({ status }: { status: DiagnoseRun["status"] }) {
  const active = ACTIVE_STATUSES.has(status);
  return (
    <Badge className={active ? "animate-pulse motion-reduce:animate-none" : ""} variant="outline">
      {status}
    </Badge>
  );
}

function FailureAlert() {
  const { t } = useI18n();
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {t("diagnose.failure")}
      </AlertDescription>
    </Alert>
  );
}

function appendOrdered(events: DiagnoseEvent[], event: DiagnoseEvent): DiagnoseEvent[] {
  if (events.some((candidate) => candidate.sequence === event.sequence)) return events;
  return [...events, event].sort((left, right) => left.sequence - right.sequence);
}

function eventLabel(kind: DiagnoseEvent["kind"], t: TranslationFunction): string {
  const keys: Record<DiagnoseEvent["kind"], MessageKey> = {
    phase: "diagnose.event.phase",
    turn: "diagnose.event.turn",
    step: "diagnose.event.step",
    thinking: "diagnose.event.thinking",
    verdict: "diagnose.event.verdict",
    "command.proposal": "diagnose.event.commandProposal",
    "command.receipt": "diagnose.event.commandReceipt",
    operation: "diagnose.event.operation",
    error: "diagnose.event.error",
    closed: "diagnose.event.closed",
  };
  return t(keys[kind]);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && error.name === "AbortError";
}
