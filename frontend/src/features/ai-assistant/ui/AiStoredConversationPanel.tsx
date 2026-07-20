import {
  AlertTriangle,
  ArrowLeft,
  Plus,
  Send,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  AiAssistantMotionProvider,
  AiAssistantTurnPresence,
} from "../../../motion/AiAssistantMotion";
import { usePrefersReducedMotion } from "../../../motion/usePrefersReducedMotion";
import { useI18n } from "../../../shared/i18n";
import { Button } from "../../../shared/ui/primitives/button";
import { Spinner } from "../../../shared/ui/primitives/spinner";
import type {
  AiConversationHistoryFailure,
  AiConversationHistoryPort,
  AiConversationLaunchContext,
  AiStoredConversation,
} from "../aiConversationHistoryContract";
import { isAbortError, toHistoryFailure } from "../aiConversationFailure";
import {
  resumeAiConversation,
  startAiConversation,
  type AiConversationSession,
} from "../aiConversationSession";
import {
  ContextTint,
  FailedThread,
  launchContextKind,
  LoadingThread,
  NewThread,
  StoredMessage,
} from "./AiStoredConversationStates";
import {
  failedConversationRecovery,
  FailedConversationState,
  submitAiMessageFromKeyboard,
} from "./AiStoredConversationFailure";

const WAITING_REFRESH_INTERVAL_MS = 1_800;

type ThreadFrame =
  | { phase: "new" }
  | { phase: "loading" }
  | { phase: "failed"; failure: AiConversationHistoryFailure }
  | { phase: "ready"; conversation: AiStoredConversation };

interface OptimisticMessage {
  id: string;
  content: string;
}

interface AiStoredConversationPanelProps {
  currentContext: AiConversationLaunchContext;
  onShowHistory: () => void;
  port: AiConversationHistoryPort;
  session: Exclude<AiConversationSession, { mode: "idle" }>;
}

export function AiStoredConversationPanel(props: AiStoredConversationPanelProps) {
  return <AiStoredConversationSession key={props.session.revision} {...props} />;
}

function AiStoredConversationSession({
  onShowHistory,
  port,
  session,
  currentContext,
}: AiStoredConversationPanelProps) {
  const { t } = useI18n();
  const [refreshKey, refresh] = useReducer((value) => value + 1, 0);
  const [frame, setFrame] = useState<ThreadFrame>(
    session.mode === "new" ? { phase: "new" } : { phase: "loading" },
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendFailure, setSendFailure] = useState<AiConversationHistoryFailure | null>(null);
  const [optimisticMessage, setOptimisticMessage] = useState<OptimisticMessage | null>(null);
  const pendingController = useRef<AbortController | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (session.mode === "new") return undefined;
    const controller = new AbortController();
    void port.load(session.conversationId, controller.signal).then((conversation) => {
      if (controller.signal.aborted) return;
      setFrame({ phase: "ready", conversation });
      setOptimisticMessage((current) => (
        current && conversation.messages.some((message) => message.id === current.id)
          ? null
          : current
      ));
    }).catch((error: unknown) => {
      if (controller.signal.aborted || isAbortError(error)) return;
      setFrame({ phase: "failed", failure: toHistoryFailure(error) });
    });
    return () => controller.abort();
  }, [port, refreshKey, session]);

  const retryThread = useCallback(() => {
    setFrame({ phase: "loading" });
    refresh();
  }, []);

  useEffect(() => {
    if (frame.phase !== "ready" || frame.conversation.status !== "waiting") return undefined;
    const timeout = window.setTimeout(refresh, WAITING_REFRESH_INTERVAL_MS);
    return () => window.clearTimeout(timeout);
  }, [frame]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView?.({
      block: "end",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [frame, optimisticMessage, reducedMotion]);

  useEffect(() => {
    inputRef.current?.focus();
    return () => pendingController.current?.abort();
  }, [session.revision]);

  const contextKind = frame.phase === "ready"
    ? frame.conversation.contextKind
    : launchContextKind(session.mode === "new" ? session.context : currentContext);
  const failureRecovery = frame.phase === "ready"
    ? failedConversationRecovery(frame.conversation)
    : null;

  const restoreFailedDraft = useCallback(() => {
    if (!failureRecovery?.retryable || !failureRecovery.userContent) return;
    setDraft(failureRecovery.userContent);
    setSendFailure(null);
    queueMicrotask(() => inputRef.current?.focus());
  }, [failureRecovery]);

  const submit = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    const controller = new AbortController();
    pendingController.current = controller;
    setSending(true);
    setSendFailure(null);
    try {
      const receipt = session.mode === "new"
        ? await port.create(message, session.context, controller.signal)
        : await port.append(session.conversationId, message, undefined, controller.signal);
      if (controller.signal.aborted) return;
      setDraft("");
      setOptimisticMessage({ id: receipt.messageId, content: message });
      if (session.mode === "new") resumeAiConversation(receipt.conversationId);
      else refresh();
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      setSendFailure(toHistoryFailure(error));
    } finally {
      if (pendingController.current === controller) pendingController.current = null;
      if (!controller.signal.aborted) setSending(false);
      inputRef.current?.focus();
    }
  }, [draft, port, sending, session]);

  return (
    <AiAssistantMotionProvider>
      <div className="flex min-h-0 flex-1 flex-col" data-slot="ai-stored-conversation">
        <div className="flex min-h-11 items-center gap-2 border-b px-3 py-2">
          <Button
            aria-label={t("shell.ai.conversationList")}
            onClick={onShowHistory}
            size="icon-sm"
            title={t("shell.ai.conversationList")}
            type="button"
            variant="ghost"
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-strong font-semibold">
              {frame.phase === "ready"
                ? frame.conversation.title
                : t("shell.ai.newConversation")}
            </p>
          </div>
          <ContextTint kind={contextKind} />
          <Button
            aria-label={t("shell.ai.newConversation")}
            onClick={() => startAiConversation(currentContext)}
            size="icon-sm"
            title={t("shell.ai.newConversation")}
            type="button"
            variant="ghost"
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>

        <div
          aria-busy={frame.phase === "loading" || sending}
          aria-label={t("shell.ai.conversation")}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
          role="log"
        >
          {frame.phase === "loading" ? <LoadingThread /> : null}
          {frame.phase === "failed" ? <FailedThread onRetry={retryThread} /> : null}
          {frame.phase === "new" ? <NewThread /> : null}
          {frame.phase === "ready" ? (
            <>
              {frame.conversation.messagesCompleteness === "partial" ? (
                <p className="mb-3 rounded-lg border border-tint-warn-border bg-tint-warn-bg px-3 py-2 text-label text-tint-warn-fg">
                  {t("shell.ai.history.thread.partial")}
                </p>
              ) : null}
              <div className="grid gap-3">
                <AiAssistantTurnPresence>
                  {frame.conversation.messages.map((message) => (
                    <StoredMessage
                      key={message.id}
                      message={message}
                    />
                  ))}
                  {optimisticMessage && !frame.conversation.messages.some(
                    (message) => message.id === optimisticMessage.id,
                  ) ? (
                    <StoredMessage
                      key={optimisticMessage.id}
                      message={{
                        id: optimisticMessage.id,
                        role: "user",
                        content: optimisticMessage.content,
                        createdAt: new Date().toISOString(),
                      }}
                    />
                  ) : null}
                </AiAssistantTurnPresence>
                {frame.conversation.status === "waiting" ? (
                  <div className="motion-assistant-surface flex items-center gap-2 text-body text-muted-foreground">
                    <Spinner decorative />
                    <span>{t("shell.ai.pending")}</span>
                  </div>
                ) : null}
                {frame.conversation.status === "failed" ? (
                  <FailedConversationState
                    onRestore={restoreFailedDraft}
                    recovery={failureRecovery}
                  />
                ) : null}
              </div>
            </>
          ) : null}
          <div aria-hidden="true" ref={threadEndRef} />
        </div>

        <form className="border-t bg-card/80 p-3 backdrop-blur" onSubmit={submit}>
          {sendFailure ? (
            <p className="mb-2 flex items-center gap-2 text-label text-tint-crit-fg" role="alert">
              <AlertTriangle aria-hidden="true" className="size-3.5" />
              {t("shell.ai.failed")}
            </p>
          ) : null}
          <div className="relative rounded-panel border bg-background shadow-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
            <textarea
              aria-label={t("shell.ai.placeholder")}
              className="min-h-20 w-full resize-none bg-transparent px-3 py-3 pb-10 pr-12 text-body outline-none placeholder:text-caption-foreground"
              disabled={sending}
              maxLength={16_000}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={submitAiMessageFromKeyboard}
              placeholder={t("shell.ai.placeholder")}
              ref={inputRef}
              value={draft}
            />
            <Button
              aria-label={t("shell.ai.send")}
              className="absolute bottom-2 right-2 rounded-full"
              disabled={!draft.trim() || sending}
              size="icon-sm"
              type="submit"
            >
              {sending ? <Spinner decorative /> : <Send aria-hidden="true" />}
            </Button>
          </div>
        </form>
      </div>
    </AiAssistantMotionProvider>
  );

}
