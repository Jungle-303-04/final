import { ListChecks, Sparkles, X } from "lucide-react";
import { useRef, useState } from "react";
import { useAuthSessionGate } from "../features/auth/AuthSessionGate";
import { useOptionalProductSession } from "../features/auth/ProductSessionContext";
import type { AiAssistantContext, AiAssistantPort } from "../features/ai-assistant/aiAssistantContract";
import { DiagnoseSurface } from "../features/diagnose/DiagnoseSurface";
import { useOptionalDiagnoseSession } from "../features/diagnose/DiagnoseSessionContext";
import { useI18n } from "../shared/i18n";
import { Button } from "../shared/ui/primitives/button";
import { AiAssistantComposer } from "./AiAssistantComposer";
import { AiAssistantConversation } from "./AiAssistantConversation";
import { aiAssistantContextChips } from "./aiAssistantContext";
import {
  AI_ASSISTANT_PANEL_DEFAULT_WIDTH,
  AiAssistantResizeHandle,
  clampAiAssistantPanelWidth,
} from "./AiAssistantResizeHandle";
import { useAiAssistantPanelController } from "./useAiAssistantPanelController";

const AI_ASSISTANT_PANEL_WIDTH_STORAGE_KEY = "opsia.ai-assistant.panel-width";

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
  const [width, setWidth] = useState(readAiAssistantPanelWidth);
  const controller = useAiAssistantPanelController({ context, open, port, reportUnauthorized });
  const chips = aiAssistantContextChips(context);
  const canCreateAlertRule = session?.roles.includes("service_admin") ?? false;

  const commitPanelWidth = (nextWidth: number) => {
    const committedWidth = clampAiAssistantPanelWidth(nextWidth);
    setWidth(committedWidth);
    persistAiAssistantPanelWidth(committedWidth);
  };

  return (
    <>
      <aside
        aria-hidden={!open}
        aria-label={t("shell.ai.title")}
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
        <div className="flex h-full min-h-0 max-w-dvw flex-col" data-inner-width={width} data-slot="ai-assistant-inner">
          <AiAssistantHeader onClose={() => onOpenChange(false)} />
          {diagnose ? <AiAssistantSurfaceTabs /> : null}
          {diagnose?.surface === "investigations" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              <DiagnoseSurface
                activeRunId={diagnose.activeRunId}
                onActiveRunChange={(runId) => (runId === null ? diagnose.closeRun() : diagnose.openRun(runId))}
                port={diagnose.port}
              />
            </div>
          ) : (
            <>
              <AiAssistantConversation
                canCreateAlertRule={canCreateAlertRule}
                chips={chips}
                entries={controller.visibleEntries}
                failed={controller.failed}
                pendingQuestion={controller.pendingQuestion}
                port={port}
              />
              <AiAssistantComposer
                inputRef={controller.inputRef}
                message={controller.message}
                onMessageChange={controller.setMessage}
                onStop={controller.stopPendingRequest}
                onSubmit={(event) => void controller.submit(event)}
                onSuggestion={controller.chooseSuggestion}
                pending={controller.pending}
                suggestions={controller.visibleSuggestions}
              />
            </>
          )}
        </div>
      </aside>
      {!open ? (
        <Button
          aria-expanded={open}
          aria-label={t("shell.ai.open")}
          className="fixed right-[var(--product-floating-action-inline-inset)] bottom-[var(--product-floating-action-block-end)] z-50 size-[var(--product-floating-action-size)] rounded-full shadow-lg"
          data-slot="ai-assistant-trigger"
          onClick={() => onOpenChange(true)}
          type="button"
        >
          <Sparkles aria-hidden="true" className="size-5" />
        </Button>
      ) : null}
    </>
  );
}

function AiAssistantHeader({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <header className="flex items-start gap-3 border-b px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-data-accent text-data-accent-foreground">
        <Sparkles aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-heading font-medium">{t("shell.ai.title")}</h2>
        <p className="truncate text-xs text-muted-foreground">{t("shell.ai.description")}</p>
      </div>
      <Button aria-label={t("shell.ai.close")} onClick={onClose} size="icon-sm" type="button" variant="ghost">
        <X aria-hidden="true" />
      </Button>
    </header>
  );
}

function AiAssistantSurfaceTabs() {
  const { t } = useI18n();
  const diagnose = useOptionalDiagnoseSession();
  if (!diagnose) return null;
  return (
    <div className="grid grid-cols-2 gap-1 border-b p-2" role="tablist">
      <Button aria-selected={diagnose.surface === "assistant"} onClick={diagnose.showAssistant} role="tab" size="sm" type="button" variant={diagnose.surface === "assistant" ? "secondary" : "ghost"}>
        <Sparkles aria-hidden="true" />{t("shell.ai.send")}
      </Button>
      <Button aria-selected={diagnose.surface === "investigations"} onClick={diagnose.showInvestigations} role="tab" size="sm" type="button" variant={diagnose.surface === "investigations" ? "secondary" : "ghost"}>
        <ListChecks aria-hidden="true" />{t("shell.ai.investigations")}
      </Button>
    </div>
  );
}

function readAiAssistantPanelWidth(): number {
  if (typeof window === "undefined") return AI_ASSISTANT_PANEL_DEFAULT_WIDTH;
  try {
    const storedValue = window.localStorage.getItem(AI_ASSISTANT_PANEL_WIDTH_STORAGE_KEY);
    if (storedValue === null) return AI_ASSISTANT_PANEL_DEFAULT_WIDTH;
    const storedWidth = Number(storedValue);
    return Number.isFinite(storedWidth) ? clampAiAssistantPanelWidth(storedWidth) : AI_ASSISTANT_PANEL_DEFAULT_WIDTH;
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
