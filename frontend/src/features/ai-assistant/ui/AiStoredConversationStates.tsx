import { AlertTriangle, Sparkles } from "lucide-react";

import { AiAssistantTurnMotion } from "../../../motion/AiAssistantMotion";
import { useI18n } from "../../../shared/i18n";
import { Button } from "../../../shared/ui/primitives/button";
import { Spinner } from "../../../shared/ui/primitives/spinner";
import { TintChip } from "../../../shared/ui/status";
import type {
  AiConversationContextKind,
  AiConversationLaunchContext,
  AiStoredConversationMessage,
} from "../aiConversationHistoryContract";

export function StoredMessage({
  message,
}: {
  message: AiStoredConversationMessage;
}) {
  const { t } = useI18n();
  const assistant = message.role === "assistant";
  return (
    <AiAssistantTurnMotion
      aria-label={t(assistant
        ? "shell.ai.history.thread.assistant"
        : "shell.ai.history.thread.user")}
      className={assistant ? "mr-7 grid gap-1" : "ml-9 grid justify-items-end gap-1"}
    >
      <span className="px-1 text-micro font-semibold uppercase tracking-wide text-caption-foreground">
        {t(assistant ? "shell.ai.history.thread.assistant" : "shell.ai.history.thread.user")}
      </span>
      <p className={assistant
        ? "whitespace-pre-wrap rounded-panel rounded-tl-sm border bg-card px-3 py-2.5 text-body leading-5 shadow-sm"
        : "whitespace-pre-wrap rounded-panel rounded-tr-sm bg-primary px-3 py-2.5 text-body leading-5 text-primary-foreground shadow-sm"
      }>
        {message.content}
      </p>
    </AiAssistantTurnMotion>
  );
}

export function LoadingThread() {
  const { t } = useI18n();
  return (
    <div className="grid min-h-44 place-items-center text-center">
      <div className="grid justify-items-center gap-2 text-muted-foreground">
        <Spinner />
        <p className="text-body">{t("shell.ai.history.thread.loading")}</p>
      </div>
    </div>
  );
}

export function FailedThread({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-44 place-items-center text-center">
      <div className="grid max-w-xs justify-items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-tint-crit-bg text-tint-crit-fg">
          <AlertTriangle aria-hidden="true" className="size-4" />
        </span>
        <p className="text-body text-muted-foreground">{t("shell.ai.history.thread.failed")}</p>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          {t("common.action.retry")}
        </Button>
      </div>
    </div>
  );
}

export function NewThread() {
  const { t } = useI18n();
  return (
    <div className="grid min-h-56 place-items-center text-center">
      <div className="grid max-w-xs justify-items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-tint-blue-bg text-tint-blue-fg">
          <Sparkles aria-hidden="true" className="size-5" />
        </span>
        <p className="text-body leading-5 text-muted-foreground">
          {t("shell.ai.history.thread.empty")}
        </p>
      </div>
    </div>
  );
}

export function ContextTint({ kind }: { kind: AiConversationContextKind }) {
  const { t } = useI18n();
  return (
    <TintChip
      className="max-w-28 rounded-full px-2.5 py-1"
      icon={<span className="size-1.5 rounded-full bg-current" />}
      label={t(`shell.ai.history.context.${kind}`)}
      tone="primary"
    />
  );
}

export function launchContextKind(
  context: AiConversationLaunchContext,
): AiConversationContextKind {
  if (context.applicationId) return "application";
  if (context.clusterId) return "cluster";
  return "general";
}
