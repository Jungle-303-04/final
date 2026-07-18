import {
  ArrowUpRight,
  CircleAlert,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";

import type { AiAssistantAnswer } from "../aiAssistantContract";
import { AiAssistantTurnMotion } from "../../../motion/AiAssistantMotion";
import { useI18n } from "../../../shared/i18n";
import { Spinner } from "../../../shared/ui/primitives/spinner";

interface CompletedTurnProps {
  action: ReactNode;
  question: string;
  response: AiAssistantAnswer;
}

interface RequestTurnProps {
  phase: "failed" | "pending";
  question: string;
}

const FLAT_ACTION_CLASS = [
  "mt-4 border-t pt-4",
  "[&_[data-action-type]]:rounded-none",
  "[&_[data-action-type]]:border-0",
  "[&_[data-action-type]]:bg-transparent",
  "[&_[data-action-type]]:p-0",
  "[&_[data-action-type]]:shadow-none",
  "[&_[data-action-type]_dl]:rounded-none",
  "[&_[data-action-type]_dl]:border-x-0",
  "[&_[data-action-type]_dl]:bg-transparent",
  "[&_[data-action-type]_dl]:px-0",
  "[&_[data-slot=ai-action-progress]]:rounded-none",
  "[&_[data-slot=ai-action-progress]]:border-x-0",
  "[&_[data-slot=ai-action-progress]]:bg-transparent",
].join(" ");

export function CompletedAssistantTurn({
  action,
  question,
  response,
}: CompletedTurnProps) {
  const { t } = useI18n();
  const unsupported = response.evidence.length === 0
    && !response.action
    && response.answerKind !== "capability";

  return (
    <AiAssistantTurnMotion
      className="grid min-w-0 gap-4 py-5 first:pt-0 last:pb-0"
      data-delivery="complete-response"
      data-slot="ai-turn"
      data-state="completed"
    >
      <TurnLine icon={<UserRound aria-hidden="true" />} tone="question">
        {question}
      </TurnLine>
      {unsupported ? (
        <TurnLine icon={<CircleAlert aria-hidden="true" />} tone="muted">
          {t("shell.ai.noEvidence")}
        </TurnLine>
      ) : (
        <div className="min-w-0 pl-7">
          <p className="break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
            {response.answer}
          </p>
          {response.evidence.length > 0 ? (
            <EvidenceLinks evidence={response.evidence} />
          ) : null}
          {action ? (
            <div className={FLAT_ACTION_CLASS} data-slot="ai-turn-action">
              {action}
            </div>
          ) : null}
        </div>
      )}
    </AiAssistantTurnMotion>
  );
}

export function RequestAssistantTurn({ phase, question }: RequestTurnProps) {
  const { t } = useI18n();
  return (
    <AiAssistantTurnMotion
      aria-busy={phase === "pending" || undefined}
      className="grid min-w-0 gap-4 py-5 first:pt-0 last:pb-0"
      data-delivery="complete-response"
      data-slot="ai-turn"
      data-state={phase}
    >
      <TurnLine icon={<UserRound aria-hidden="true" />} tone="question">
        {question}
      </TurnLine>
      <TurnLine
        icon={phase === "pending"
          ? <Spinner className="size-4" decorative />
          : <CircleAlert aria-hidden="true" />}
        tone={phase === "pending" ? "muted" : "failure"}
      >
        {phase === "pending" ? t("shell.ai.pending") : t("shell.ai.failed")}
      </TurnLine>
    </AiAssistantTurnMotion>
  );
}

function TurnLine({
  children,
  icon,
  tone,
}: {
  children: ReactNode;
  icon: ReactNode;
  tone: "failure" | "muted" | "question";
}) {
  return (
    <div
      className={[
        "flex min-w-0 items-start gap-3",
        tone === "failure" ? "text-destructive" : "",
        tone === "muted" ? "text-muted-foreground" : "",
      ].join(" ")}
      data-tone={tone}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4"
      >
        {icon}
      </span>
      <p className={[
        "min-w-0 break-words text-sm leading-relaxed [overflow-wrap:anywhere]",
        tone === "question" ? "font-medium text-foreground" : "",
      ].join(" ")}>
        {children}
      </p>
    </div>
  );
}

function EvidenceLinks({ evidence }: { evidence: AiAssistantAnswer["evidence"] }) {
  const { t } = useI18n();
  return (
    <section aria-label={t("shell.ai.evidence")} className="mt-4 min-w-0 border-t pt-3">
      <h4 className="text-xs font-medium text-muted-foreground">{t("shell.ai.evidence")}</h4>
      <ul className="mt-1 divide-y">
        {evidence.map((item) => (
          <li className="min-w-0" key={`${item.type}:${item.id}`}>
            <a
              className="group flex min-w-0 items-center gap-2 py-2 text-sm font-medium underline-offset-4 hover:underline"
              href={item.link}
            >
              <span
                className="min-w-0 break-words [overflow-wrap:anywhere]"
                title={item.label}
              >
                {item.label}
              </span>
              <ArrowUpRight
                aria-hidden="true"
                className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
