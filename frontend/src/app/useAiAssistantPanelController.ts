import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AiAssistantPortFailure,
  type AiAssistantContext,
  type AiAssistantPort,
  type AiAssistantSuggestion,
} from "../features/ai-assistant/aiAssistantContract";
import type {
  AiContextSuggestions,
  AiPendingQuestion,
  AiTranscriptEntry,
} from "./aiAssistantPanelTypes";

export function useAiAssistantPanelController({
  context,
  open,
  port,
  reportUnauthorized,
}: {
  context: AiAssistantContext;
  open: boolean;
  port: AiAssistantPort;
  reportUnauthorized: () => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingController = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<AiPendingQuestion | null>(null);
  const [failureContextKey, setFailureContextKey] = useState<string | null>(null);
  const [entries, setEntries] = useState<AiTranscriptEntry[]>([]);
  const [suggestions, setSuggestions] = useState<AiContextSuggestions>({ contextKey: "", items: [] });
  const contextKey = JSON.stringify(context);
  const visibleEntries = entries.filter((entry) => entry.contextKey === contextKey);
  const visibleSuggestions = suggestions.contextKey === contextKey ? suggestions.items : [];

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
      if (error instanceof AiAssistantPortFailure && error.code === "unauthorized") reportUnauthorized();
      setSuggestions({ contextKey, items: [] });
    });
    return () => controller.abort();
  }, [contextKey, open, port, reportUnauthorized]);

  useEffect(() => () => pendingController.current?.abort(), [contextKey, open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const question = message.trim();
    if (!question || pending) return;
    const controller = new AbortController();
    pendingController.current = controller;
    setPending(true);
    setPendingQuestion({ contextKey, question });
    setMessage("");
    setFailureContextKey(null);
    try {
      const response = await port.ask(context, question, controller.signal);
      if (controller.signal.aborted) return;
      setEntries((current) => [...current.slice(-19), {
        id: ++sequence.current,
        contextKey,
        question,
        response,
      }]);
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      if (error instanceof AiAssistantPortFailure && error.code === "unauthorized") reportUnauthorized();
      setFailureContextKey(contextKey);
    } finally {
      if (pendingController.current === controller) {
        pendingController.current = null;
        setPending(false);
        setPendingQuestion(null);
        inputRef.current?.focus();
      }
    }
  };

  const chooseSuggestion = (suggestion: AiAssistantSuggestion) => {
    setMessage(suggestion.prompt);
    inputRef.current?.focus();
  };

  const stopPendingRequest = () => {
    pendingController.current?.abort();
    pendingController.current = null;
    setPending(false);
    setPendingQuestion(null);
    inputRef.current?.focus();
  };

  return {
    chooseSuggestion,
    contextKey,
    failed: failureContextKey === contextKey,
    inputRef,
    message,
    pending,
    pendingQuestion: pendingQuestion?.contextKey === contextKey ? pendingQuestion : null,
    setMessage,
    stopPendingRequest,
    submit,
    visibleEntries,
    visibleSuggestions,
  };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
