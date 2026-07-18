import { Send, Square } from "lucide-react";
import type { FormEventHandler, KeyboardEvent, RefObject } from "react";
import type { AiAssistantSuggestion } from "../features/ai-assistant/aiAssistantContract";
import { useI18n } from "../shared/i18n";
import { Button } from "../shared/ui/primitives/button";

export function AiAssistantComposer({
  inputRef,
  message,
  onMessageChange,
  onStop,
  onSubmit,
  onSuggestion,
  pending,
  suggestions,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  message: string;
  onMessageChange: (message: string) => void;
  onStop: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onSuggestion: (suggestion: AiAssistantSuggestion) => void;
  pending: boolean;
  suggestions: AiAssistantSuggestion[];
}) {
  const { t } = useI18n();
  return (
    <form className="border-t bg-background/95 px-3.5 pb-3.5 pt-3" onSubmit={onSubmit}>
      {suggestions.length ? (
        <div aria-label={t("shell.ai.suggestion.aria")} className="mb-2.5 flex gap-1.5 overflow-x-auto" role="group">
          {suggestions.map((suggestion) => (
            <Button className="h-auto shrink-0 rounded-full px-3 py-1.5 text-xs" key={suggestion.id} onClick={() => onSuggestion(suggestion)} type="button" variant="outline">
              {suggestion.prompt}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="relative rounded-2xl border border-input bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
        <textarea
          aria-label={t("shell.ai.placeholder")}
          className="min-h-16 w-full resize-none rounded-2xl bg-transparent px-3.5 py-3 pr-12 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70"
          maxLength={16_000}
          onChange={(event) => onMessageChange(event.currentTarget.value)}
          onKeyDown={submitFromKeyboard}
          placeholder={t("shell.ai.placeholder")}
          ref={inputRef}
          value={message}
        />
        {!pending ? (
          <Button aria-label={t("shell.ai.send")} className="absolute bottom-2.5 right-2.5 rounded-full" disabled={message.trim().length === 0} size="icon-sm" type="submit">
            <Send aria-hidden="true" />
          </Button>
        ) : (
          <Button className="absolute bottom-2.5 right-2.5 rounded-full" onClick={onStop} size="sm" type="button" variant="outline">
            <Square aria-hidden="true" />{t("shell.ai.stop")}
          </Button>
        )}
      </div>
    </form>
  );
}

function submitFromKeyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}
