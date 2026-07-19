import { AlertTriangle, MessageSquareText, Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import type {
  AiConversationContextKind,
  AiConversationHistoryFailure,
  AiConversationHistoryItem,
  AiConversationHistoryPage,
  AiConversationHistoryPort,
  AiConversationLaunchContext,
} from "../../features/ai-assistant/aiConversationHistoryContract";
import {
  isAbortError,
  toHistoryFailure,
} from "../../features/ai-assistant/aiConversationFailure";
import {
  resumeAiConversation,
  startAiConversation,
  useAiConversationSession,
} from "../../features/ai-assistant/aiConversationSession";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import {
  AiAssistantHistoryPresence,
  AiAssistantHistoryRowMotion,
  AiAssistantMotionProvider,
} from "../../motion/AiAssistantMotion";
import { useI18n, type TranslationFunction } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductSurfaceTitle } from "../../shared/ui/ProductSurfaceTitle";
import { Button } from "../../shared/ui/primitives/button";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/primitives/table";
import { TintChip } from "../../shared/ui/status";
type HistoryFrame =
  | { phase: "loading" }
  | { phase: "failed"; failure: AiConversationHistoryFailure }
  | { phase: "ready"; page: AiConversationHistoryPage };
export function AiHistoryPage({ port }: { port: AiConversationHistoryPort }) {
  const { locale, t } = useI18n();
  const filter = useUnifiedFilter();
  const [refreshKey, refresh] = useReducer((value) => value + 1, 0);
  const [frame, setFrame] = useState<HistoryFrame>({ phase: "loading" });
  const session = useAiConversationSession();
  const selectedApplication = filter.state.common.applications[0];
  const selectedCluster = filter.state.common.clusters[0];
  const launchContext = useMemo<AiConversationLaunchContext>(() => ({
    ...(selectedApplication ? { applicationId: selectedApplication } : {}),
    ...(selectedCluster ? { clusterId: selectedCluster } : {}),
    locale,
  }), [locale, selectedApplication, selectedCluster]);

  useEffect(() => {
    const controller = new AbortController();
    void port.list(controller.signal).then((page) => {
      if (!controller.signal.aborted) setFrame({ phase: "ready", page });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || isAbortError(error)) return;
      setFrame({ phase: "failed", failure: toHistoryFailure(error) });
    });
    return () => controller.abort();
  }, [port, refreshKey]);

  const retry = useCallback(() => {
    setFrame({ phase: "loading" });
    refresh();
  }, []);

  const createNew = useCallback(() => startAiConversation(launchContext), [launchContext]);

  return (
    <ProductPageFrame>
      <header className="flex min-w-0 items-center gap-2.5">
        <ProductSurfaceTitle icon={Sparkles} title={t("shell.ai.history.title")} />
        <Button
          className="ml-auto"
          onClick={createNew}
          size="page-action"
          type="button"
        >
          <span>{t("shell.ai.newConversation")}</span>
        </Button>
      </header>

      <section aria-label={t("shell.ai.history.title")} className="min-w-0">
        {frame.phase === "loading" ? <HistoryLoading /> : null}
        {frame.phase === "failed" ? (
          <HistoryFailure onRetry={retry} />
        ) : null}
        {frame.phase === "ready" && frame.page.items.length === 0 ? (
          <HistoryEmpty onCreate={createNew} />
        ) : null}
        {frame.phase === "ready" && frame.page.items.length > 0 ? (
          <>
            {frame.page.completeness === "partial" ? (
              <div
                className="mb-2 flex min-w-0 items-center gap-2 rounded-lg border border-tint-warn-border bg-tint-warn-bg px-3 py-2 text-label text-tint-warn-fg"
                role="status"
              >
                <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="min-w-0 truncate">{t("shell.ai.history.partial")}</span>
              </div>
            ) : null}
            <HistoryData
              activeConversationId={session.mode === "resume" ? session.conversationId : null}
              items={frame.page.items}
            />
          </>
        ) : null}
      </section>
    </ProductPageFrame>
  );
}

function HistoryData({
  activeConversationId,
  items,
}: {
  activeConversationId: string | null;
  items: readonly AiConversationHistoryItem[];
}) {
  const { t } = useI18n();
  const [renderedAt] = useState(() => Date.now());
  return (
    <AiAssistantMotionProvider>
      <div className="overflow-hidden rounded-card border bg-card">
        <Table scrollAreaLabel={t("shell.ai.history.title")}>
          <TableHeader className="bg-background-subtle">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[64%] px-3.5 text-micro font-semibold tracking-[0.05em] text-caption-foreground">
                {t("shell.ai.history.columns.conversation")}
              </TableHead>
              <TableHead className="w-[17%] px-3.5 text-micro font-semibold tracking-[0.05em] text-caption-foreground">
                {t("shell.ai.history.columns.context")}
              </TableHead>
              <TableHead className="w-[19%] px-3.5 text-micro font-semibold tracking-[0.05em] text-caption-foreground">
                {t("shell.ai.history.columns.time")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AiAssistantHistoryPresence>
              {items.map((item, index) => (
                <AiAssistantHistoryRowMotion
                  aria-selected={activeConversationId === item.id}
                  className="group relative h-[4.625rem] border-b border-border-subtle transition-colors last:border-b-0 hover:bg-muted/50 aria-selected:bg-tint-blue-bg motion-reduce:transition-none"
                  index={index}
                  key={item.id}
                >
                  <TableCell className="max-w-0 px-3.5 py-2.5 whitespace-normal">
                    <button
                      aria-label={t("shell.ai.history.open", { title: item.title })}
                      className="grid w-full min-w-0 gap-0.5 text-left outline-none after:absolute after:inset-0 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => resumeAiConversation(item.id)}
                      type="button"
                    >
                      <span className="truncate text-label-2 font-bold text-foreground">
                        {item.title}
                      </span>
                      <span className="truncate text-label text-caption-foreground">
                        {previewFor(item, t)}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell className="px-3.5 py-2.5">
                    <ContextTint kind={item.contextKind} />
                  </TableCell>
                  <TableCell className="px-3.5 py-2.5 font-mono text-label-2 tabular-nums text-caption-foreground">
                    {relativeTime(item.updatedAt, renderedAt, t)}
                  </TableCell>
                </AiAssistantHistoryRowMotion>
              ))}
            </AiAssistantHistoryPresence>
          </TableBody>
        </Table>
      </div>
    </AiAssistantMotionProvider>
  );
}

function ContextTint({ kind }: { kind: AiConversationContextKind }) {
  const { t } = useI18n();
  return (
    <TintChip
      className="max-w-full rounded-full px-2.5 py-1 text-caption font-bold"
      icon={<span className="motion-live-dot size-1.5 rounded-full bg-current" />}
      label={t(`shell.ai.history.context.${kind}`)}
      tone="primary"
    />
  );
}

function HistoryLoading() {
  return (
    <div aria-busy="true" className="overflow-hidden rounded-card border bg-card">
      <div className="grid h-10 grid-cols-[minmax(0,64fr)_17fr_19fr] items-center border-b bg-background-subtle px-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-10" />
      </div>
      {Array.from({ length: 3 }, (_, index) => (
        <div className="grid h-[4.625rem] grid-cols-[minmax(0,64fr)_17fr_19fr] items-center border-b px-4 last:border-b-0" key={index}>
          <div className="grid gap-2 pr-5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

function HistoryFailure({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-64 place-items-center rounded-card border bg-card px-6 py-10 text-center">
      <div className="grid max-w-md justify-items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-tint-crit-bg text-tint-crit-fg">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>
        <div className="grid gap-1">
          <h2 className="text-title-2 font-semibold">{t("shell.ai.history.failed.title")}</h2>
          <p className="text-body leading-5 text-muted-foreground">
            {t("shell.ai.history.failed.description")}
          </p>
        </div>
        <Button onClick={onRetry} size="page-secondary" type="button" variant="outline">
          {t("common.action.retry")}
        </Button>
      </div>
    </div>
  );
}

function HistoryEmpty({ onCreate }: { onCreate: () => void }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-64 place-items-center rounded-card border bg-card px-6 py-10 text-center">
      <div className="grid max-w-md justify-items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-tint-blue-bg text-tint-blue-fg">
          <MessageSquareText aria-hidden="true" className="size-5" />
        </span>
        <div className="grid gap-1">
          <h2 className="text-title-2 font-semibold">{t("shell.ai.history.empty.title")}</h2>
          <p className="text-body leading-5 text-muted-foreground">
            {t("shell.ai.history.empty.description")}
          </p>
        </div>
        <Button onClick={onCreate} size="page-action" type="button">
          <Plus aria-hidden="true" />
          {t("shell.ai.newConversation")}
        </Button>
      </div>
    </div>
  );
}

function previewFor(item: AiConversationHistoryItem, t: TranslationFunction): string {
  if (item.status === "waiting") return t("shell.ai.history.status.waiting");
  if (item.status === "failed") return t("shell.ai.history.status.failed");
  return item.preview ?? t("shell.ai.history.previewUnavailable");
}

function relativeTime(value: string, now: number, t: TranslationFunction): string {
  const elapsed = Math.max(0, now - Date.parse(value));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return t("shell.ai.history.time.justNow");
  if (minutes < 60) return t("shell.ai.history.time.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("shell.ai.history.time.hours", { count: hours });
  if (hours < 48) return t("shell.ai.history.time.yesterday");
  return t("shell.ai.history.time.days", { count: Math.floor(hours / 24) });
}
