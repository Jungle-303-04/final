import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Circle,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AiAssistantAnswer, AiAssistantPort } from "../features/ai-assistant/aiAssistantContract";
import { useI18n } from "../shared/i18n";
import { Alert, AlertDescription } from "../shared/ui/primitives/alert";
import { Badge } from "../shared/ui/primitives/badge";
import { Button } from "../shared/ui/primitives/button";
import { Spinner } from "../shared/ui/primitives/spinner";
import { AiAlertRuleActionCard } from "./AiAlertRuleActionCard";
import type { AiPendingQuestion, AiTranscriptEntry } from "./aiAssistantPanelTypes";

export function AiAssistantConversation({
  canCreateAlertRule,
  chips,
  entries,
  failed,
  pendingQuestion,
  port,
}: {
  canCreateAlertRule: boolean;
  chips: string[];
  entries: AiTranscriptEntry[];
  failed: boolean;
  pendingQuestion: AiPendingQuestion | null;
  port: AiAssistantPort;
}) {
  const { t } = useI18n();
  const endRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);

  useEffect(() => {
    if (followRef.current) endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [entries.length, pendingQuestion]);

  return (
    <div
      aria-label={t("shell.ai.conversation")}
      className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 py-4 [scrollbar-gutter:stable]"
      data-slot="ai-conversation"
      onScroll={(event) => {
        const target = event.currentTarget;
        followRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 140;
      }}
      role="log"
    >
      <section aria-labelledby="ai-context-title" className="grid gap-2">
        <h3 className="text-xs font-medium text-muted-foreground" id="ai-context-title">{t("shell.ai.context")}</h3>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip, index) => <Badge key={`${chip}:${index}`} variant="outline">{chip}</Badge>)}
        </div>
      </section>

      <div aria-live="polite" className="mt-5 grid gap-4">
        {entries.map((entry) => (
          <article className="motion-ai-turn-enter grid gap-2.5" key={entry.id}>
            <UserQuestion question={entry.question} />
            <AnalysisProgress complete />
            <AiResultCard canCreateAlertRule={canCreateAlertRule} port={port} response={entry.response} />
          </article>
        ))}
        {pendingQuestion ? (
          <article className="motion-ai-turn-enter grid gap-2.5" data-slot="ai-pending-turn">
            <UserQuestion question={pendingQuestion.question} />
            <AnalysisProgress complete={false} />
          </article>
        ) : null}
        {failed ? (
          <Alert variant="destructive"><AlertDescription>{t("shell.ai.failed")}</AlertDescription></Alert>
        ) : null}
        <div aria-hidden="true" ref={endRef} />
      </div>
    </div>
  );
}

function UserQuestion({ question }: { question: string }) {
  return (
    <p className="motion-ai-user-enter ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm font-medium leading-relaxed text-primary-foreground">
      {question}
    </p>
  );
}

function AnalysisProgress({ complete }: { complete: boolean }) {
  const { t } = useI18n();
  const steps = [
    t("shell.ai.analysis.context"),
    t("shell.ai.analysis.evidence"),
    t("shell.ai.analysis.answer"),
  ];
  return (
    <section
      aria-label={t("shell.ai.analysis.title")}
      className="mr-auto grid w-full max-w-[96%] gap-2.5 rounded-2xl rounded-bl-md border bg-card px-4 py-3"
      data-slot="ai-analysis-progress"
      role="status"
    >
      <header className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        {complete ? <Check aria-hidden="true" className="size-3.5 text-status-healthy" /> : <Spinner className="size-3.5 text-data-accent" decorative />}
        {complete ? t("shell.ai.analysis.complete") : t("shell.ai.pending")}
      </header>
      <ol className="ml-1 grid gap-2 border-l pl-4">
        {steps.map((label, index) => {
          const done = complete || index === 0;
          const active = !complete && index === 1;
          return (
            <li className="relative flex min-w-0 items-center gap-2 text-xs" key={label}>
              <span className="absolute -left-[1.3125rem] grid size-4 place-items-center rounded-full bg-card" aria-hidden="true">
                {done ? <Check className="size-3 text-status-healthy" strokeWidth={3} /> : active ? <Spinner className="size-3 text-data-accent" decorative /> : <Circle className="size-2.5 text-muted-foreground/50" />}
              </span>
              <span className={done || active ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
            </li>
          );
        })}
      </ol>
      {!complete ? <ThinkingDots /> : null}
    </section>
  );
}

function ThinkingDots() {
  return (
    <span className="flex w-fit items-center gap-1 pt-0.5" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span className="motion-ai-thinking-dot size-1.5 rounded-full bg-data-accent/55" data-delay={index || undefined} key={index} />
      ))}
    </span>
  );
}

function AiResultCard({
  canCreateAlertRule,
  port,
  response,
}: {
  canCreateAlertRule: boolean;
  port: AiAssistantPort;
  response: AiAssistantAnswer;
}) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const unsupported = response.evidence.length === 0 && !response.action && response.answerKind !== "capability";
  const toggleLabel = t(collapsed ? "shell.ai.result.expand" : "shell.ai.result.collapse");
  return (
    <section
      className="mr-auto w-full max-w-[96%] overflow-hidden rounded-2xl rounded-bl-md border bg-card"
      data-collapsed={collapsed || undefined}
      data-slot="ai-result-card"
    >
      <Button
        aria-expanded={!collapsed}
        aria-label={toggleLabel}
        className="h-auto w-full justify-start rounded-none border-b px-4 py-3 text-left hover:bg-muted/40"
        onClick={() => setCollapsed((value) => !value)}
        type="button"
        variant="ghost"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-data-accent/10 text-data-accent"><Sparkles aria-hidden="true" className="size-3.5" /></span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{t("shell.ai.result.summary", { count: response.evidence.length })}</span>
        <ChevronDown aria-hidden="true" className={collapsed ? "size-4 -rotate-90 text-muted-foreground" : "size-4 text-muted-foreground"} />
      </Button>
      <div aria-hidden={!collapsed} className="motion-ai-result-summary">
        <div className="min-h-0 overflow-hidden"><p className="truncate px-4 py-3 text-xs text-muted-foreground">{t("shell.ai.result.summary", { count: response.evidence.length })}</p></div>
      </div>
      <div aria-hidden={collapsed} className="motion-ai-result-content">
        <div className="min-h-0 overflow-hidden">
          <div className="grid gap-3 px-4 py-4">
            <p className={unsupported ? "text-sm leading-relaxed text-muted-foreground" : "text-sm leading-relaxed"}>
              {unsupported ? t("shell.ai.noEvidence") : response.answer}
            </p>
            {response.evidence.length > 0 ? <EvidenceLinks evidence={response.evidence} /> : null}
            {response.action && canCreateAlertRule ? <AiAlertRuleActionCard action={response.action} onCreate={port.createAlertRule} /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function EvidenceLinks({ evidence }: { evidence: AiAssistantAnswer["evidence"] }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-2 border-t pt-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Search aria-hidden="true" className="size-3.5" />{t("shell.ai.evidence")}</p>
      <div className="flex flex-wrap gap-2">
        {evidence.map((item) => (
          <a className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium text-data-accent hover:bg-data-accent/5" href={item.link} key={`${item.type}:${item.id}`}>
            {item.label}<ArrowUpRight aria-hidden="true" className="size-3" />
          </a>
        ))}
      </div>
    </div>
  );
}
