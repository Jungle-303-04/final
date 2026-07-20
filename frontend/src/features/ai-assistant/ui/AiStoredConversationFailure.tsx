import { AlertTriangle } from "lucide-react";
import type { KeyboardEvent } from "react";

import { useI18n } from "../../../shared/i18n";
import { Button } from "../../../shared/ui/primitives/button";
import type { AiStoredConversation } from "../aiConversationHistoryContract";

export interface FailedConversationRecovery {
  code: "rate_limited" | "unavailable";
  retryable: boolean;
  userContent: string | null;
}

export function submitAiMessageFromKeyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

export function failedConversationRecovery(
  conversation: AiStoredConversation,
): FailedConversationRecovery | null {
  if (conversation.status !== "failed") return null;
  const assistantIndex = [...conversation.messages]
    .map((message, index) => ({ index, message }))
    .reverse()
    .find(({ message }) => message.failure !== undefined)?.index;
  if (assistantIndex === undefined) return null;
  const assistant = conversation.messages[assistantIndex];
  if (!assistant?.failure) return null;
  const user = [...conversation.messages]
    .slice(0, assistantIndex)
    .reverse()
    .find((message) => message.role === "user");
  return {
    code: assistant.failure.code,
    retryable: assistant.failure.retryable,
    userContent: user?.content ?? null,
  };
}

export function FailedConversationState({
  onRestore,
  recovery,
}: {
  onRestore: () => void;
  recovery: FailedConversationRecovery | null;
}) {
  const { t } = useI18n();
  return (
    <div
      className="grid gap-2 rounded-panel border border-tint-crit-border bg-tint-crit-bg p-3 text-tint-crit-fg"
      role="status"
    >
      <p className="flex min-w-0 items-center gap-2 text-body font-semibold">
        <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{t("shell.ai.history.status.failed")}</span>
      </p>
      {recovery ? (
        <p className="text-label leading-5">
          {t("shell.ai.history.failureCode", { code: recovery.code })}
        </p>
      ) : null}
      {recovery?.retryable && recovery.userContent ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button onClick={onRestore} size="sm" type="button" variant="outline">
            {t("shell.ai.history.restoreDraft")}
          </Button>
          <span className="text-caption leading-4">
            {t("shell.ai.history.restoreDraftHint")}
          </span>
        </div>
      ) : null}
    </div>
  );
}
