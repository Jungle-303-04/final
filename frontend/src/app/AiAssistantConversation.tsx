import { Send, Square } from "lucide-react";
import type {
  FormEventHandler,
  KeyboardEventHandler,
  RefObject,
} from "react";

import type {
  AiAssistantAnswer,
  AiAssistantPort,
  AiAssistantSuggestion,
} from "../features/ai-assistant/aiAssistantContract";
import {
  CompletedAssistantTurn,
  RequestAssistantTurn,
} from "../features/ai-assistant/ui/AiAssistantTurn";
import { AiAssistantSuggestions } from "../features/ai-assistant/ui/AiAssistantSuggestions";
import type { AssistantRequestState } from "../features/ai-assistant/ui/assistantTurnState";
import { AiAssistantTurnPresence } from "../motion/AiAssistantMotion";
import { useI18n } from "../shared/i18n";
import { Badge } from "../shared/ui/primitives/badge";
import { Button } from "../shared/ui/primitives/button";
import { AiAlertRuleActionCard } from "./AiAlertRuleActionCard";

export interface AiAssistantTranscriptEntry {
  id: number;
  contextKey: string;
  question: string;
  response: AiAssistantAnswer;
}

interface AiAssistantConversationProps {
  canCreateAlertRule: boolean;
  chips: readonly string[];
  contextKey: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  message: string;
  onChooseSuggestion: (suggestion: AiAssistantSuggestion) => void;
  onMessageChange: (message: string) => void;
  onStopPendingRequest: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onSubmitFromKeyboard: KeyboardEventHandler<HTMLTextAreaElement>;
  pending: boolean;
  port: AiAssistantPort;
  request: AssistantRequestState;
  threadEndRef: RefObject<HTMLDivElement | null>;
  visibleEntries: readonly AiAssistantTranscriptEntry[];
  visibleSuggestions: readonly AiAssistantSuggestion[];
}

export function AiAssistantConversation({
  canCreateAlertRule,
  chips,
  contextKey,
  inputRef,
  message,
  onChooseSuggestion,
  onMessageChange,
  onStopPendingRequest,
  onSubmit,
  onSubmitFromKeyboard,
  pending,
  port,
  request,
  threadEndRef,
  visibleEntries,
  visibleSuggestions,
}: AiAssistantConversationProps) {
  const { t } = useI18n();
  return (
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
            <AiAssistantSuggestions items={visibleSuggestions} onChoose={onChooseSuggestion} />
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

      <form className="border-t p-4" onSubmit={onSubmit}>
        <div className="relative">
          <textarea
            aria-label={t("shell.ai.placeholder")}
            className="min-h-20 w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 pb-11 pr-12 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            maxLength={16_000}
            onChange={(event) => onMessageChange(event.currentTarget.value)}
            onKeyDown={onSubmitFromKeyboard}
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
              onClick={onStopPendingRequest}
              size="sm"
              type="button"
              variant="outline"
            >
              <Square aria-hidden="true" />
              {t("shell.ai.stop")}
            </Button>
          )}
        </div>
      </form>
    </>
  );
}
