import { BellRing, Check, Pencil, ShieldCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import type {
  AiAlertRuleAction,
  AiAlertRuleActionPayload,
} from "../features/ai-assistant/aiAssistantContract";
import { useI18n } from "../shared/i18n";
import { Alert, AlertDescription } from "../shared/ui/primitives/alert";
import { Badge } from "../shared/ui/primitives/badge";
import { Button } from "../shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../shared/ui/primitives/dialog";
import { Input } from "../shared/ui/primitives/input";
import { Label } from "../shared/ui/primitives/label";
import { Spinner } from "../shared/ui/primitives/spinner";

export function AiAlertRuleActionCard({
  action,
  onCreate,
}: {
  action: AiAlertRuleAction;
  onCreate(action: AiAlertRuleAction, signal?: AbortSignal): Promise<{ ruleId: string }>;
}) {
  const { formatNumber, t } = useI18n();
  const [draft, setDraft] = useState(action.payload);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  useEffect(() => {
    setDraft(action.payload);
    setReceipt(null);
    setFailure(false);
  }, [action]);

  const submit = async () => {
    if (pending || receipt !== null) return;
    setPending(true);
    setFailure(false);
    try {
      const created = await onCreate({ ...action, payload: draft });
      setReceipt(created.ruleId);
      setEditing(false);
    } catch {
      setFailure(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-label={t("shell.ai.action.title")}
      aria-busy={pending}
      className="grid min-w-0 gap-3 rounded-xl border border-primary/25 bg-primary/[0.035] p-3 shadow-sm"
      data-action-type={action.type}
    >
      <header className="flex min-w-0 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <BellRing aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-medium">{t("shell.ai.action.title")}</h4>
            <Badge variant="outline">{t("shell.ai.action.confirmation")}</Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {action.rationale}
          </p>
        </div>
      </header>

      <dl className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 rounded-lg border bg-background/70 p-3 text-xs">
        <Fact label={t("shell.ai.action.name")} value={draft.name} wide />
        <Fact label={t("shell.ai.action.scope")} value={scopeLabel(draft, t("shell.ai.action.currentScope"))} wide />
        <Fact label={t("shell.ai.action.condition")} value={`${metricLabel(draft.metric, t)} ${draft.comparator} ${formatNumber(draft.threshold)}%`} />
        <Fact label={t("shell.ai.action.duration")} value={t("shell.ai.action.seconds", { count: formatNumber(draft.forSeconds) })} />
        <Fact label={t("shell.ai.action.severity")} value={t(`alerts.severity.${draft.severity}`)} />
        <Fact label={t("shell.ai.action.channels")} value={draft.channels.length > 0 ? draft.channels.join(", ") : t("shell.ai.action.inAppOnly")} />
      </dl>

      <ActionProgress failure={failure} pending={pending} receipt={receipt} />

      {receipt ? (
        <Alert>
          <ShieldCheck aria-hidden="true" />
          <AlertDescription>
            {t("shell.ai.action.created", { id: receipt })}
          </AlertDescription>
        </Alert>
      ) : failure ? (
        <Alert variant="destructive">
          <AlertDescription>{t("shell.ai.action.failed")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          className="min-w-36"
          disabled={pending || receipt !== null}
          onClick={() => setEditing(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Pencil aria-hidden="true" />
          {t("shell.ai.action.edit")}
        </Button>
        <Button
          disabled={pending || receipt !== null}
          onClick={() => void submit()}
          size="sm"
          type="button"
        >
          {pending ? <Spinner /> : receipt ? <Check aria-hidden="true" /> : <BellRing aria-hidden="true" />}
          {pending ? t("shell.ai.action.creating") : receipt ? t("shell.ai.action.createdShort") : t("shell.ai.action.create")}
        </Button>
      </div>

      <Dialog onOpenChange={setEditing} open={editing}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("shell.ai.action.editTitle")}</DialogTitle>
            <DialogDescription>{t("shell.ai.action.editDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2" label={t("shell.ai.action.name")}>
              <Input
                maxLength={120}
                onChange={(event) => update({ name: event.currentTarget.value })}
                value={draft.name}
              />
            </Field>
            <Field label={t("shell.ai.action.threshold")}>
              <Input
                min={0}
                onChange={(event) => updateNumber("threshold", event.currentTarget.value)}
                step="0.1"
                type="number"
                value={draft.threshold}
              />
            </Field>
            <Field label={t("shell.ai.action.duration")}>
              <Input
                max={86_400}
                min={1}
                onChange={(event) => updateNumber("forSeconds", event.currentTarget.value)}
                type="number"
                value={draft.forSeconds}
              />
            </Field>
            <Field label={t("shell.ai.action.comparator")}>
              <select
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                onChange={(event) => update({ comparator: event.currentTarget.value as AiAlertRuleActionPayload["comparator"] })}
                value={draft.comparator}
              >
                <option value=">">&gt;</option>
                <option value=">=">≥</option>
                <option value="<">&lt;</option>
                <option value="<=">≤</option>
              </select>
            </Field>
            <Field label={t("shell.ai.action.severity")}>
              <select
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                onChange={(event) => update({ severity: event.currentTarget.value as AiAlertRuleActionPayload["severity"] })}
                value={draft.severity}
              >
                {(["critical", "high", "medium", "low"] as const).map((severity) => (
                  <option key={severity} value={severity}>{t(`alerts.severity.${severity}`)}</option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">{t("shell.ai.action.scope")}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {scopeValues(draft).map((value) => <Badge key={value} variant="outline">{value}</Badge>)}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setEditing(false)} type="button" variant="outline">
              {t("common.action.close")}
            </Button>
            <Button disabled={!validDraft(draft)} onClick={() => setEditing(false)} type="button">
              {t("shell.ai.action.apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );

  function update(changes: Partial<AiAlertRuleActionPayload>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function updateNumber(field: "threshold" | "forSeconds", value: string) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) update({ [field]: parsed });
  }
}

function ActionProgress({
  failure,
  pending,
  receipt,
}: {
  failure: boolean;
  pending: boolean;
  receipt: string | null;
}) {
  const { t } = useI18n();
  const steps = [
    { done: true, label: t("shell.ai.action.progress.proposed") },
    {
      done: pending || receipt !== null,
      label: pending || receipt !== null
        ? t("shell.ai.action.progress.approved")
        : t("shell.ai.action.progress.awaiting"),
    },
    {
      active: pending,
      done: receipt !== null,
      label: receipt !== null
        ? t("shell.ai.action.progress.completed")
        : failure
          ? t("shell.ai.action.progress.failed")
          : pending
            ? t("shell.ai.action.progress.submitting")
            : t("shell.ai.action.progress.ready"),
    },
  ];
  return (
    <ol
      aria-live="polite"
      className="grid grid-cols-3 overflow-hidden rounded-lg border bg-background text-[0.6875rem]"
      data-slot="ai-action-progress"
    >
      {steps.map((step, index) => (
        <li
          className="relative flex min-w-0 items-center gap-1.5 border-r px-2 py-2 last:border-r-0"
          key={step.label}
        >
          <span
            aria-hidden="true"
            className={[
              "size-1.5 shrink-0 rounded-full",
              step.done ? "bg-status-healthy" : step.active ? "animate-pulse bg-primary" : failure && index === 2 ? "bg-destructive" : "bg-muted-foreground/35",
            ].join(" ")}
          />
          <span className="min-w-0 break-words leading-tight">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

function Fact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Field({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <Label className={`grid gap-1.5 ${className ?? ""}`}>
      <span>{label}</span>
      {children}
    </Label>
  );
}

function validDraft(draft: AiAlertRuleActionPayload): boolean {
  return draft.name.trim().length > 0 && draft.threshold >= 0 &&
    Number.isInteger(draft.forSeconds) && draft.forSeconds > 0;
}

function scopeValues(payload: AiAlertRuleActionPayload): string[] {
  return [
    ...payload.scope.clusters.map((value) => `클러스터: ${value}`),
    ...payload.scope.namespaces.map((value) => `네임스페이스: ${value}`),
    ...payload.scope.applications.map((value) => `애플리케이션: ${value}`),
    ...payload.scope.labels.map((value) => `라벨: ${value}`),
  ];
}

function scopeLabel(payload: AiAlertRuleActionPayload, fallback: string): string {
  return scopeValues(payload).join(" · ") || fallback;
}

function metricLabel(
  metric: AiAlertRuleActionPayload["metric"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  return t(`shell.ai.action.metric.${metric}`);
}
