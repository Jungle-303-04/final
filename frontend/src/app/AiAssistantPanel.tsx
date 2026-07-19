import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
  type AiAssistantContext,
  type AiAssistantPort,
  type AiAssistantSuggestion,
} from "../features/ai-assistant/aiAssistantContract";
import {
  assistantRequestReducer,
  INITIAL_ASSISTANT_REQUEST_STATE,
} from "../features/ai-assistant/ui/assistantTurnState";
import { aiAssistantContextChips } from "./aiAssistantContext";
import {
  AI_ASSISTANT_PANEL_DEFAULT_WIDTH,
  clampAiAssistantPanelWidth,
} from "./AiAssistantResizeHandle";
import { useOptionalDiagnoseSession } from "../features/diagnose/DiagnoseSessionContext";
import type { AiConversationHistoryPort } from "../features/ai-assistant/aiConversationHistoryContract";
import { useAiConversationSession } from "../features/ai-assistant/aiConversationSession";
import type { AiAssistantTranscriptEntry } from "./AiAssistantConversation";
import { AiAssistantPanelSurface } from "./AiAssistantPanelSurface";

const AI_ASSISTANT_PANEL_WIDTH_STORAGE_KEY = "opsia.ai-assistant.panel-width";

interface ContextSuggestions {
  contextKey: string;
  items: AiAssistantSuggestion[];
}
export function AiAssistantPanel({
  context,
  historyPort,
  onOpenChange,
  onShowHistory,
  onWidthChange,
  open,
  port,
}: {
  context: AiAssistantContext;
  historyPort: AiConversationHistoryPort;
  onOpenChange: (open: boolean) => void;
  onShowHistory: () => void;
  onWidthChange?: (width: number) => void;
  open: boolean;
  port: AiAssistantPort;
}) {
  const { reportUnauthorized } = useAuthSessionGate();
  const session = useOptionalProductSession();
  const diagnose = useOptionalDiagnoseSession();
  const storedConversation = useAiConversationSession();
  const openerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousOpen = useRef(open);
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
  const [entries, setEntries] = useState<AiAssistantTranscriptEntry[]>([]);
  const [suggestions, setSuggestions] = useState<ContextSuggestions>({
    contextKey: "",
    items: [],
  });
  const contextKey = JSON.stringify(context);
  const visibleEntries = entries.filter((entry) => entry.contextKey === contextKey);
  const visibleSuggestions = suggestions.contextKey === contextKey ? suggestions.items : [];
  const chips = aiAssistantContextChips(context);
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
  useEffect(() => onWidthChange?.(width), [onWidthChange, width]);
  useLayoutEffect(() => {
    if (open && !previousOpen.current && openerRef.current === null) {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && activeElement !== document.body) {
        openerRef.current = activeElement;
      }
    }
    if (!open && previousOpen.current) {
      queueMicrotask(() => {
        const opener = openerRef.current;
        const target = opener?.isConnected ? opener : triggerRef.current;
        target?.focus();
        openerRef.current = null;
      });
    }
    previousOpen.current = open;
  }, [open]);

  const rememberOpener = useCallback((opener: HTMLElement) => {
    openerRef.current = opener;
  }, []);

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

  return <AiAssistantPanelSurface
    canCreateAlertRule={canCreateAlertRule}
    chips={chips}
    context={context}
    contextKey={contextKey}
    diagnose={diagnose}
    historyPort={historyPort}
    inputRef={inputRef}
    message={message}
    onChooseSuggestion={chooseSuggestion}
    onMessageChange={setMessage}
    onOpenChange={onOpenChange}
    onRememberOpener={rememberOpener}
    onShowHistory={onShowHistory}
    onStopPendingRequest={stopPendingRequest}
    onSubmit={submit}
    onSubmitFromKeyboard={submitFromKeyboard}
    onWidthCommit={commitPanelWidth}
    open={open}
    panelRef={panelRef}
    pending={pending}
    port={port}
    request={request}
    storedConversation={storedConversation}
    threadEndRef={threadEndRef}
    triggerRef={triggerRef}
    visibleEntries={visibleEntries}
    visibleSuggestions={visibleSuggestions}
    width={width}
  />;

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
