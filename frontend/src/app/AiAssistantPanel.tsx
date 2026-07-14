import {
  ArrowUpRight,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { useAuthSessionGate } from "../features/auth/AuthSessionGate";
import {
  AiAssistantPortFailure,
  type AiAssistantAnswer,
  type AiAssistantContext,
  type AiAssistantPort,
  type AiAssistantSuggestion,
} from "../features/ai-assistant/aiAssistantContract";
import { useI18n } from "../shared/i18n";
import { Alert, AlertDescription } from "../shared/ui/primitives/alert";
import { Badge } from "../shared/ui/primitives/badge";
import { Button } from "../shared/ui/primitives/button";
import { aiAssistantContextChips } from "./aiAssistantContext";
import { AiAssistantResizeHandle } from "./AiAssistantResizeHandle";

const DEFAULT_WIDTH = 420;

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sequence = useRef(0);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [failureContextKey, setFailureContextKey] = useState<string | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [suggestions, setSuggestions] = useState<ContextSuggestions>({
    contextKey: "",
    items: [],
  });
  const contextKey = JSON.stringify(context);
  const visibleEntries = entries.filter((entry) => entry.contextKey === contextKey);
  const visibleSuggestions = suggestions.contextKey === contextKey ? suggestions.items : [];
  const chips = aiAssistantContextChips(context);

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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const question = message.trim();
    if (!question || pending) return;
    setPending(true);
    setFailureContextKey(null);
    try {
      const response = await port.ask(context, question);
      setEntries((current) => [...current.slice(-19), {
        id: ++sequence.current,
        contextKey,
        question,
        response,
      }]);
      setMessage("");
    } catch (error) {
      if (error instanceof AiAssistantPortFailure && error.code === "unauthorized") {
        reportUnauthorized();
      }
      setFailureContextKey(contextKey);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      <aside
        aria-label={t("shell.ai.title")}
        className="motion-ai-panel relative min-h-0 shrink-0 overflow-hidden border-l bg-background"
        data-open={open || undefined}
        data-side="right"
        data-slot="ai-assistant-panel"
        data-width={width}
        onKeyDown={(event) => event.key === "Escape" && onOpenChange(false)}
      >
        <AiAssistantResizeHandle onWidthChange={setWidth} width={width} />
        <div
          className="flex h-full min-h-0 flex-col"
          data-inner-width={width}
          data-slot="ai-assistant-inner"
        >
          <header className="flex items-start gap-3 border-b px-4 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles aria-hidden="true" className="size-4" />
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

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
                <div className="grid gap-2">
                  {visibleSuggestions.map((suggestion) => (
                    <Button
                      className="h-auto justify-start whitespace-normal text-left"
                      key={suggestion.id}
                      onClick={() => chooseSuggestion(suggestion)}
                      type="button"
                      variant="outline"
                    >
                      {suggestion.label}
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}

            <div aria-live="polite" className="mt-5 grid gap-4">
              {visibleEntries.map((entry) => (
                <article className="grid gap-2" key={entry.id}>
                  <p className="ml-8 rounded-lg bg-muted px-3 py-2 text-sm">{entry.question}</p>
                  {entry.response.evidence.length === 0 ? (
                    <Alert><AlertDescription>{t("shell.ai.noEvidence")}</AlertDescription></Alert>
                  ) : (
                    <div className="grid gap-3 rounded-lg border px-3 py-3">
                      <p className="text-sm leading-relaxed">{entry.response.answer}</p>
                      <EvidenceLinks evidence={entry.response.evidence} />
                    </div>
                  )}
                </article>
              ))}
              {pending ? <p className="text-sm text-muted-foreground">{t("shell.ai.pending")}</p> : null}
              {failureContextKey === contextKey ? (
                <Alert variant="destructive">
                  <AlertDescription>{t("shell.ai.failed")}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          </div>

          <form className="grid gap-2 border-t p-4 pb-24" onSubmit={submit}>
            <textarea
              aria-label={t("shell.ai.placeholder")}
              className="min-h-20 w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              maxLength={16_000}
              onChange={(event) => setMessage(event.currentTarget.value)}
              placeholder={t("shell.ai.placeholder")}
              ref={inputRef}
              value={message}
            />
            {!pending ? (
              <Button className="justify-self-end" type="submit">
                <Send aria-hidden="true" />
                {t("shell.ai.send")}
              </Button>
            ) : null}
          </form>
        </div>
      </aside>
      <Button
        aria-expanded={open}
        aria-label={open ? t("shell.ai.close") : t("shell.ai.open")}
        className="fixed right-6 bottom-6 z-50 size-14 rounded-full shadow-lg"
        data-slot="ai-assistant-trigger"
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        <Sparkles aria-hidden="true" className="size-5" />
      </Button>
    </>
  );

  function chooseSuggestion(suggestion: AiAssistantSuggestion) {
    setMessage(suggestion.prompt);
    inputRef.current?.focus();
  }
}

function EvidenceLinks({ evidence }: { evidence: AiAssistantAnswer["evidence"] }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{t("shell.ai.evidence")}</p>
      {evidence.map((item) => (
        <a
          className="flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
          href={item.link}
          key={`${item.type}:${item.id}`}
        >
          {item.label}
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </a>
      ))}
    </div>
  );
}
