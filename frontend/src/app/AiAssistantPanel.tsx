import {
  ListChecks,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { useAuthSessionGate } from "../features/auth/AuthSessionGate";
import { useOptionalProductSession } from "../features/auth/ProductSessionContext";
import {
  AiAssistantPortFailure,
  type AiAssistantAnswer,
  type AiAssistantContext,
  type AiAssistantPort,
  type AiAssistantSuggestion,
} from "../features/ai-assistant/aiAssistantContract";
import {
  CompletedAssistantTurn,
  RequestAssistantTurn,
} from "../features/ai-assistant/ui/AiAssistantTurn";
import { AiAssistantSuggestions } from "../features/ai-assistant/ui/AiAssistantSuggestions";
import {
  assistantRequestReducer,
  INITIAL_ASSISTANT_REQUEST_STATE,
} from "../features/ai-assistant/ui/assistantTurnState";
import {
  AiAssistantMotionProvider,
  AiAssistantTurnPresence,
} from "../motion/AiAssistantMotion";
import { useI18n } from "../shared/i18n";
import { Badge } from "../shared/ui/primitives/badge";
import { Button } from "../shared/ui/primitives/button";
import { aiAssistantContextChips } from "./aiAssistantContext";
import {
  AI_ASSISTANT_PANEL_DEFAULT_WIDTH,
  AiAssistantResizeHandle,
  clampAiAssistantPanelWidth,
} from "./AiAssistantResizeHandle";
import { AiAlertRuleActionCard } from "./AiAlertRuleActionCard";
import { DiagnoseSurface } from "../features/diagnose/DiagnoseSurface";
import { useOptionalDiagnoseSession } from "../features/diagnose/DiagnoseSessionContext";

const AI_ASSISTANT_PANEL_WIDTH_STORAGE_KEY = "opsia.ai-assistant.panel-width";

interface TranscriptEntry {
  id: number;
  contextKey: string;
  question: string;
  response: AiAssistantAnswer;
}

interface ContextSuggestions {
  contextKey: string;
  items: AiAssistantSuggestion[];
}

export function AiAssistantPanel({
  context,
  onOpenChange,
  open,
  port,
}: {
  context: AiAssistantContext;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  port: AiAssistantPort;
}) {
  const { t } = useI18n();
  const { reportUnauthorized } = useAuthSessionGate();
  const session = useOptionalProductSession();
  const diagnose = useOptionalDiagnoseSession();
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingController = useRef<AbortController | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);
  const [width, setWidth] = useState(readAiAssistantPanelWidth);
  const [message, setMessage] = useState("");
  const [request, dispatchRequest] = useReducer(
    assistantRequestReducer,
    INITIAL_ASSISTANT_REQUEST_STATE,
  );
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [suggestions, setSuggestions] = useState<ContextSuggestions>({
    contextKey: "",
    items: [],
  });
  const contextKey = JSON.stringify(context);
  const visibleEntries = entries.filter((entry) => entry.contextKey === contextKey);
  const visibleSuggestions = suggestions.contextKey === contextKey ? suggestions.items : [];
  const chips = aiAssistantContextChips(context);
  const stopLabel = t("shell.ai.stop");
  const pending = request.phase === "pending";
  const canCreateAlertRule = session?.roles.includes("service_admin") ?? false;

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const requestId = ++sequence.current;
    const controller = new AbortController();
    const requestContext = JSON.parse(contextKey) as AiAssistantContext;
    void port.loadSuggestions(requestContext, controller.signal).then((next) => {
      if (!controller.signal.aborted && sequence.current === requestId) {
        setSuggestions({ contextKey, items: next });
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted || sequence.current !== requestId) return;
      if (error instanceof AiAssistantPortFailure && error.code === "unauthorized") {
        reportUnauthorized();
      }
      setSuggestions({ contextKey, items: [] });
    });
    return () => controller.abort();
  }, [contextKey, open, port, reportUnauthorized]);

  useEffect(() => {
    if (!open) return;
    threadEndRef.current?.scrollIntoView?.({ block: "end" });
  }, [contextKey, open, pending, visibleEntries.length]);

  useEffect(() => () => pendingController.current?.abort(), [contextKey, open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const question = message.trim();
    if (!question || pending) return;
    const controller = new AbortController();
    pendingController.current = controller;
    dispatchRequest({ contextKey, question, type: "submitted" });
    setMessage("");
    try {
      const response = await port.ask(context, question, controller.signal);
      if (controller.signal.aborted) return;
      setEntries((current) => [...current.slice(-19), {
        id: ++sequence.current,
        contextKey,
        question,
        response,
      }]);
      dispatchRequest({ type: "settled" });
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      if (error instanceof AiAssistantPortFailure && error.code === "unauthorized") {
        reportUnauthorized();
      }
      dispatchRequest({ contextKey, question, type: "failed" });
    } finally {
      if (pendingController.current === controller) {
        pendingController.current = null;
        if (controller.signal.aborted) dispatchRequest({ type: "cancelled" });
        inputRef.current?.focus();
      }
    }
  };

  return (
    <>
      <aside
        aria-label={t("shell.ai.title")}
        aria-hidden={!open}
        className="motion-ai-panel relative h-full max-h-full min-h-0 max-w-dvw shrink-0 overflow-hidden border-l-0 bg-background data-[open=true]:border-l"
        data-open={open || undefined}
        data-side="right"
        data-slot="ai-assistant-panel"
        data-width={width}
        inert={!open}
        onKeyDown={(event) => event.key === "Escape" && onOpenChange(false)}
        ref={panelRef}
      >
        <AiAssistantResizeHandle hostRef={panelRef} onWidthCommit={commitPanelWidth} width={width} />
        <AiAssistantMotionProvider>
          <div
            className="flex h-full min-h-0 max-w-dvw flex-col"
            data-inner-width={width}
            data-slot="ai-assistant-inner"
          >
          <header className="flex items-start gap-3 border-b px-4 py-3">
            <span className="grid size-9 shrink-0 place-items-center text-muted-foreground">
              <Sparkles aria-hidden="true" className="size-4 text-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-heading font-medium">{t("shell.ai.title")}</h2>
              <p className="text-xs text-muted-foreground">{t("shell.ai.description")}</p>
            </div>
            <Button
              aria-label={t("shell.ai.close")}
              onClick={() => onOpenChange(false)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </header>

          {diagnose ? (
            <div className="grid grid-cols-2 gap-1 border-b p-2" role="tablist">
              <Button
                aria-selected={diagnose.surface === "assistant"}
                onClick={diagnose.showAssistant}
                role="tab"
                size="sm"
                type="button"
                variant={diagnose.surface === "assistant" ? "secondary" : "ghost"}
              >
                <Sparkles aria-hidden="true" />
                {t("shell.ai.send")}
              </Button>
              <Button
                aria-selected={diagnose.surface === "investigations"}
                onClick={diagnose.showInvestigations}
                role="tab"
                size="sm"
                type="button"
                variant={diagnose.surface === "investigations" ? "secondary" : "ghost"}
              >
                <ListChecks aria-hidden="true" />
                {t("shell.ai.investigations")}
              </Button>
            </div>
          ) : null}

          {diagnose?.surface === "investigations" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              <DiagnoseSurface
                activeRunId={diagnose.activeRunId}
                onActiveRunChange={(runId) => (
                  runId === null ? diagnose.closeRun() : diagnose.openRun(runId)
                )}
                port={diagnose.port}
              />
            </div>
          ) : (
            <>
          <div
            aria-label={t("shell.ai.conversation")}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
            data-slot="ai-conversation"
            role="log"
          >
            <section aria-labelledby="ai-context-title" className="grid gap-2">
              <h3 className="text-xs font-medium text-muted-foreground" id="ai-context-title">
                {t("shell.ai.context")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {chips.map((chip, index) => (
                  <Badge key={`${chip}:${index}`} variant="outline">{chip}</Badge>
                ))}
              </div>
            </section>

            {visibleSuggestions.length > 0 && visibleEntries.length === 0 ? (
              <section aria-labelledby="ai-suggestions-title" className="mt-5 grid gap-2">
                <h3 className="text-xs font-medium text-muted-foreground" id="ai-suggestions-title">
                  {t("shell.ai.suggestions")}
                </h3>
                <AiAssistantSuggestions
                  items={visibleSuggestions}
                  onChoose={chooseSuggestion}
                />
              </section>
            ) : null}

            <div
              aria-live="polite"
              className="mt-5 divide-y"
              data-response-transport="complete-response"
            >
              <AiAssistantTurnPresence>
                {visibleEntries.map((entry) => (
                  <CompletedAssistantTurn
                    action={entry.response.action && canCreateAlertRule ? (
                      <AiAlertRuleActionCard
                        action={entry.response.action}
                        onCreate={port.createAlertRule}
                      />
                    ) : null}
                    key={entry.id}
                    question={entry.question}
                    response={entry.response}
                  />
                ))}
                {request.phase !== "idle" && request.contextKey === contextKey ? (
                  <RequestAssistantTurn
                    key={`request:${request.contextKey}:${request.question}`}
                    phase={request.phase}
                    question={request.question}
                  />
                ) : null}
              </AiAssistantTurnPresence>
              <div aria-hidden="true" ref={threadEndRef} />
            </div>
          </div>

          <form className="border-t p-4" onSubmit={submit}>
            <div className="relative">
              <textarea
                aria-label={t("shell.ai.placeholder")}
                className="min-h-20 w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 pb-11 pr-12 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                maxLength={16_000}
                onChange={(event) => setMessage(event.currentTarget.value)}
                onKeyDown={submitFromKeyboard}
                placeholder={t("shell.ai.placeholder")}
                ref={inputRef}
                value={message}
              />
              {!pending ? (
                <Button
                  aria-label={t("shell.ai.send")}
                  className="absolute bottom-2 right-2"
                  disabled={message.trim().length === 0}
                  size="icon-sm"
                  type="submit"
                >
                  <Send aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  className="absolute bottom-2 right-2"
                  onClick={stopPendingRequest}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Square aria-hidden="true" />
                  {stopLabel}
                </Button>
              )}
            </div>
          </form>
            </>
          )}
          </div>
        </AiAssistantMotionProvider>
      </aside>
      {!open ? <Button
        aria-expanded={open}
        aria-label={t("shell.ai.open")}
        className="fixed right-[var(--product-floating-action-inline-inset)] bottom-[var(--product-floating-action-block-end)] z-50 size-[var(--product-floating-action-size)] rounded-full shadow-lg"
        data-slot="ai-assistant-trigger"
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        <Sparkles aria-hidden="true" className="size-5" />
      </Button> : null}
    </>
  );

  function chooseSuggestion(suggestion: AiAssistantSuggestion) {
    setMessage(suggestion.prompt);
    inputRef.current?.focus();
  }

  function submitFromKeyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function stopPendingRequest() {
    pendingController.current?.abort();
    pendingController.current = null;
    dispatchRequest({ type: "cancelled" });
    inputRef.current?.focus();
  }

  function commitPanelWidth(nextWidth: number) {
    const committedWidth = clampAiAssistantPanelWidth(nextWidth);
    setWidth(committedWidth);
    persistAiAssistantPanelWidth(committedWidth);
  }
}

function readAiAssistantPanelWidth(): number {
  if (typeof window === "undefined") return AI_ASSISTANT_PANEL_DEFAULT_WIDTH;
  try {
    const storedValue = window.localStorage.getItem(AI_ASSISTANT_PANEL_WIDTH_STORAGE_KEY);
    if (storedValue === null) return AI_ASSISTANT_PANEL_DEFAULT_WIDTH;
    const storedWidth = Number(storedValue);
    return Number.isFinite(storedWidth)
      ? clampAiAssistantPanelWidth(storedWidth)
      : AI_ASSISTANT_PANEL_DEFAULT_WIDTH;
  } catch {
    return AI_ASSISTANT_PANEL_DEFAULT_WIDTH;
  }
}

function persistAiAssistantPanelWidth(width: number): void {
  try {
    window.localStorage.setItem(AI_ASSISTANT_PANEL_WIDTH_STORAGE_KEY, `${width}`);
  } catch {
    // A disabled storage backend must not block panel resizing.
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
