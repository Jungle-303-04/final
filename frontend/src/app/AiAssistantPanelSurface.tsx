import { ListChecks, Sparkles, X } from "lucide-react";
import type {
  FormEventHandler,
  KeyboardEventHandler,
  RefObject,
} from "react";

import type {
  AiAssistantContext,
  AiAssistantPort,
  AiAssistantSuggestion,
} from "../features/ai-assistant/aiAssistantContract";
import type { AiConversationHistoryPort } from "../features/ai-assistant/aiConversationHistoryContract";
import type { AiConversationSession } from "../features/ai-assistant/aiConversationSession";
import { AiStoredConversationPanel } from "../features/ai-assistant/ui/AiStoredConversationPanel";
import type { AssistantRequestState } from "../features/ai-assistant/ui/assistantTurnState";
import { DiagnoseSurface } from "../features/diagnose/DiagnoseSurface";
import type { DiagnosePort } from "../features/diagnose/diagnoseContract";
import { AiAssistantMotionProvider } from "../motion/AiAssistantMotion";
import { useI18n } from "../shared/i18n";
import { Button } from "../shared/ui/primitives/button";
import {
  AiAssistantConversation,
  type AiAssistantTranscriptEntry,
} from "./AiAssistantConversation";
import { AiAssistantResizeHandle } from "./AiAssistantResizeHandle";

interface DiagnoseSession {
  activeRunId: string | null;
  closeRun: () => void;
  openRun: (runId: string) => void;
  port: DiagnosePort;
  showAssistant: () => void;
  showInvestigations: () => void;
  surface: "assistant" | "investigations";
}

interface AiAssistantPanelSurfaceProps {
  canCreateAlertRule: boolean;
  chips: readonly string[];
  context: AiAssistantContext;
  contextKey: string;
  diagnose: DiagnoseSession | null;
  historyPort: AiConversationHistoryPort;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  message: string;
  onChooseSuggestion: (suggestion: AiAssistantSuggestion) => void;
  onMessageChange: (message: string) => void;
  onOpenChange: (open: boolean) => void;
  onRememberOpener: (opener: HTMLElement) => void;
  onShowHistory: () => void;
  onStopPendingRequest: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onSubmitFromKeyboard: KeyboardEventHandler<HTMLTextAreaElement>;
  onWidthCommit: (width: number) => void;
  open: boolean;
  panelRef: RefObject<HTMLElement | null>;
  pending: boolean;
  port: AiAssistantPort;
  request: AssistantRequestState;
  storedConversation: AiConversationSession;
  threadEndRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  visibleEntries: readonly AiAssistantTranscriptEntry[];
  visibleSuggestions: readonly AiAssistantSuggestion[];
  width: number;
}

export function AiAssistantPanelSurface({
  canCreateAlertRule,
  chips,
  context,
  contextKey,
  diagnose,
  historyPort,
  inputRef,
  message,
  onChooseSuggestion,
  onMessageChange,
  onOpenChange,
  onRememberOpener,
  onShowHistory,
  onStopPendingRequest,
  onSubmit,
  onSubmitFromKeyboard,
  onWidthCommit,
  open,
  panelRef,
  pending,
  port,
  request,
  storedConversation,
  threadEndRef,
  triggerRef,
  visibleEntries,
  visibleSuggestions,
  width,
}: AiAssistantPanelSurfaceProps) {
  const { locale, t } = useI18n();
  const launchContext = {
    ...(context.filters.applications[0]
      ? { applicationId: context.filters.applications[0] }
      : {}),
    ...(context.filters.clusters[0] ? { clusterId: context.filters.clusters[0] } : {}),
    locale,
  };
  return (
    <>
      <aside
        aria-label={t("shell.ai.title")}
        aria-hidden={!open}
        className="motion-ai-panel absolute inset-y-0 right-0 z-40 h-full max-h-full min-h-0 max-w-dvw overflow-hidden border-l-0 bg-background data-[open=true]:border-l"
        data-open={open || undefined}
        data-side="right"
        data-slot="ai-assistant-panel"
        data-width={width}
        inert={!open}
        onKeyDown={(event) => event.key === "Escape" && onOpenChange(false)}
        ref={panelRef}
      >
        <AiAssistantResizeHandle hostRef={panelRef} onWidthCommit={onWidthCommit} width={width} />
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

            {diagnose && storedConversation.mode === "idle" ? (
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

            {storedConversation.mode !== "idle" ? (
              <AiStoredConversationPanel
                currentContext={launchContext}
                onShowHistory={onShowHistory}
                port={historyPort}
                session={storedConversation}
              />
            ) : diagnose?.surface === "investigations" ? (
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
              <AiAssistantConversation
                canCreateAlertRule={canCreateAlertRule}
                chips={chips}
                contextKey={contextKey}
                inputRef={inputRef}
                message={message}
                onChooseSuggestion={onChooseSuggestion}
                onMessageChange={onMessageChange}
                onStopPendingRequest={onStopPendingRequest}
                onSubmit={onSubmit}
                onSubmitFromKeyboard={onSubmitFromKeyboard}
                pending={pending}
                port={port}
                request={request}
                threadEndRef={threadEndRef}
                visibleEntries={visibleEntries}
                visibleSuggestions={visibleSuggestions}
              />
            )}
          </div>
        </AiAssistantMotionProvider>
      </aside>
      {!open ? (
        <Button
          aria-expanded={open}
          aria-label={t("shell.ai.open")}
          className="fixed right-[var(--product-floating-action-inline-inset)] bottom-[var(--product-floating-action-block-end)] z-50 size-[var(--product-floating-action-size)] rounded-full shadow-lg"
          data-slot="ai-assistant-trigger"
          onClick={(event) => {
            onRememberOpener(event.currentTarget);
            onOpenChange(true);
          }}
          ref={triggerRef}
          type="button"
        >
          <Sparkles aria-hidden="true" className="size-5" />
        </Button>
      ) : null}
    </>
  );
}
