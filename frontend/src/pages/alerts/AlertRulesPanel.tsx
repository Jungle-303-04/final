import { BellPlus, Pencil, Power, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useMotionAwareScrollIntoView } from "../../motion/scrollIntoView";
import type {
  AlertRule,
  AlertRuleInput,
  AlertRuleMetric,
  AlertRulesPort,
} from "../../features/alerts/alertRulesContract";
import type { AlertChannelsPort } from "../../features/alerts/alertChannelsContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { useI18n } from "../../shared/i18n";
import type { AlertsMessageKey } from "../../shared/i18n/keys/alerts";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../shared/ui/primitives/dialog";
import { Input } from "../../shared/ui/primitives/input";
import { Label } from "../../shared/ui/primitives/label";
import { Spinner } from "../../shared/ui/primitives/spinner";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";
import { AlertRuleChannelsField } from "./AlertRuleChannelsField";
export function AlertRulesPanel({
  channelsPort,
  focusRuleId,
  port,
}: {
  channelsPort: AlertChannelsPort;
  focusRuleId: string | null;
  port: AlertRulesPort;
}) {
  const { formatDate, formatNumber, t } = useI18n();
  const filter = useUnifiedFilter();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingOperation, setPendingOperation] = useState<"create" | "delete" | "toggle" | "update" | null>(null);
  const [draft, setDraft] = useState<AlertRuleInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteRule, setDeleteRule] = useState<AlertRule | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const focusedRef = useRef<HTMLDivElement>(null);
  const scrollIntoView = useMotionAwareScrollIntoView();
  const currentScope = useMemo(() => ({
    clusters: [...filter.state.common.clusters],
    namespaces: filter.state.common.namespaces.map(({ clusterId, namespace }) => `${clusterId}/${namespace}`),
    applications: [...filter.state.common.applications],
    labels: filter.state.common.labels.map(({ key, value }) => `${key}=${value}`),
  }), [filter.state.common]);
  useEffect(() => {
    const controller = new AbortController();
    void port.list(controller.signal).then((next) => {
      setRules(next);
      setLoading(false);
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFailure(true);
      setLoading(false);
    });
    return () => controller.abort();
  }, [port]);
  useEffect(() => {
    if (!focusRuleId || loading) return;
    const frame = requestAnimationFrame(() => {
      scrollIntoView(focusedRef.current, { block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRuleId, loading, scrollIntoView]);
  const beginCreate = () => {
    setFailure(false);
    setFeedback(null);
    setEditingId(null);
    setDraft({
      name: "",
      scope: currentScope,
      metric: "cpu_pct",
      comparator: ">",
      threshold: 70,
      forSeconds: 20,
      severity: "high",
      channels: [],
      enabled: true,
    });
  };
  const beginEdit = (rule: AlertRule) => {
    setFailure(false);
    setFeedback(null);
    setEditingId(rule.id);
    setDraft({
      name: rule.name,
      scope: rule.scope,
      metric: rule.metric,
      comparator: rule.comparator,
      threshold: rule.threshold,
      forSeconds: rule.forSeconds,
      severity: rule.severity,
      channels: rule.channels,
      enabled: rule.enabled,
    });
  };
  const save = async () => {
    if (!draft || !validDraft(draft) || pendingId) return;
    const operationId = editingId ?? "create";
    setPendingId(operationId);
    setPendingOperation(editingId ? "update" : "create");
    setFailure(false);
    setFeedback(null);
    try {
      if (editingId) {
        const updated = await port.update(editingId, draft);
        setRules((current) => current.map((rule) => rule.id === updated.id ? updated : rule));
        setFeedback(t("alerts.rules.saved"));
      } else {
        await port.create(draft);
        const refreshed = await port.list();
        setRules(refreshed);
        setFeedback(t("alerts.rules.created"));
      }
      setDraft(null);
      setEditingId(null);
    } catch {
      setFailure(true);
    } finally {
      setPendingId(null);
      setPendingOperation(null);
    }
  };
  const toggle = async (rule: AlertRule) => {
    if (pendingId) return;
    setPendingId(rule.id);
    setPendingOperation("toggle");
    setFailure(false);
    setFeedback(null);
    try {
      const updated = await port.update(rule.id, { enabled: !rule.enabled });
      setRules((current) => current.map((item) => item.id === rule.id ? updated : item));
      setFeedback(t("alerts.rules.saved"));
    } catch { setFailure(true); } finally { setPendingId(null); setPendingOperation(null); }
  };
  const remove = async () => {
    if (!deleteRule || pendingId) return;
    setPendingId(deleteRule.id);
    setPendingOperation("delete");
    setFailure(false);
    setFeedback(null);
    try {
      await port.remove(deleteRule.id);
      setRules((current) => current.filter((rule) => rule.id !== deleteRule.id));
      setDeleteRule(null);
      setFeedback(t("alerts.rules.deleted"));
    } catch { setFailure(true); } finally { setPendingId(null); setPendingOperation(null); }
  };

  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="alert-rules-title">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" id="alert-rules-title">{t("alerts.rules.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("alerts.rules.description")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            aria-label={t("common.action.refresh")}
            disabled={loading || pendingId !== null}
            onClick={() => {
              setLoading(true);
              setFailure(false);
              setFeedback(null);
              void port.list().then((next) => {
                setRules(next);
                setLoading(false);
              }).catch(() => {
                setFailure(true);
                setLoading(false);
              });
            }}
            size="widget-icon"
            type="button"
            variant="outline"
          >
            {loading ? <Spinner /> : <RefreshCw aria-hidden="true" />}
          </Button>
          <Button disabled={pendingId !== null} onClick={beginCreate} size="page-action" type="button"><BellPlus aria-hidden="true" />{t("alerts.rules.create")}</Button>
        </div>
      </header>
      <div aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {feedback ?? (failure ? t("alerts.rules.failure") : "")}
      </div>
      {loading ? (
        <div className="grid min-h-52 place-items-center rounded-xl border"><Spinner /> <span className="sr-only">{t("alerts.rules.loading")}</span></div>
      ) : rules.length === 0 ? (
        <div className="grid min-h-52 place-items-center rounded-xl border border-dashed p-8 text-center">
          <div className="grid justify-items-center gap-2"><BellPlus className="size-6 text-muted-foreground" /><p className="font-semibold">{t("alerts.rules.empty.title")}</p><p className="text-sm text-muted-foreground">{t("alerts.rules.empty.description")}</p><Button onClick={beginCreate} size="page-action">{t("alerts.rules.create")}</Button></div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rules.map((rule) => {
            const scope = scopeLabel(rule, t("alerts.rules.scopeAll"));
            const focused = rule.id === focusRuleId;
            return (
              <Card
                aria-busy={pendingId === rule.id}
                className={focused ? "min-w-0 ring-2 ring-primary/60" : "min-w-0"}
                data-alert-rule-id={rule.id}
                key={rule.id}
                ref={focused ? focusedRef : undefined}
              >
                <CardHeader className="grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0"><CardTitle><OverflowIdentity value={rule.name} /></CardTitle><p className="mt-1 truncate text-xs text-muted-foreground" title={scope}>{scope}</p></div>
                  <Badge variant={rule.enabled ? "default" : "secondary"}>{rule.enabled ? t("alerts.rules.enabled") : t("alerts.rules.disabled")}</Badge>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {pendingId === rule.id ? (
                    <div aria-live="polite" className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Spinner />
                      <span>{t("alerts.rules.saving")}</span>
                    </div>
                  ) : null}
                  <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
                    <RuleFact label={t("alerts.rules.metric")} value={metricLabel(rule.metric, t)} />
                    <RuleFact label={t("alerts.rules.threshold")} value={`${rule.comparator} ${formatNumber(rule.threshold)}${metricUnit(rule.metric)}`} />
                    <RuleFact label={t("alerts.rules.duration")} value={t("alerts.rules.seconds", { count: formatNumber(rule.forSeconds) })} />
                    <RuleFact label={t("alerts.rules.severity")} value={t(`alerts.severity.${rule.severity}`)} />
                  </dl>
                  <p className="text-xs text-muted-foreground">{t("alerts.rules.occurrences", { count: formatNumber(rule.occurrenceCount) })} · {rule.lastFiredAt ? t("alerts.rules.lastFired", { time: formatDate(new Date(rule.lastFiredAt), { dateStyle: "short", timeStyle: "short" }) }) : t("alerts.rules.neverFired")}</p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button disabled={pendingId !== null} onClick={() => void toggle(rule)} size="compact-segment" variant="outline">{pendingId === rule.id && pendingOperation === "toggle" ? <Spinner /> : <Power aria-hidden="true" />}{rule.enabled ? t("alerts.rules.disable") : t("alerts.rules.enable")}</Button>
                    <Button disabled={pendingId !== null} onClick={() => beginEdit(rule)} size="compact-segment" variant="outline"><Pencil aria-hidden="true" />{t("alerts.rules.edit")}</Button>
                    <Button disabled={pendingId !== null} onClick={() => setDeleteRule(rule)} size="compact-segment" variant="outline"><Trash2 aria-hidden="true" />{t("alerts.rules.delete")}</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <RuleDialog
        channelsPort={channelsPort}
        draft={draft}
        editing={editingId !== null}
        pending={pendingId !== null && (pendingOperation === "create" || pendingOperation === "update")}
        setDraft={setDraft}
        onSave={() => void save()}
      />
      <Dialog onOpenChange={(open) => { if (!open) setDeleteRule(null); }} open={deleteRule !== null}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("alerts.rules.deleteTitle")}</DialogTitle><DialogDescription>{t("alerts.rules.deleteDescription")}</DialogDescription></DialogHeader>
          <DialogFooter><Button onClick={() => setDeleteRule(null)} variant="outline">{t("alerts.rules.cancel")}</Button><Button disabled={pendingId !== null} onClick={() => void remove()} variant="destructive">{pendingId ? <Spinner /> : <Trash2 />}{t("alerts.rules.delete")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function RuleDialog({
  channelsPort,
  draft,
  editing,
  onSave,
  pending,
  setDraft,
}: {
  channelsPort: AlertChannelsPort;
  draft: AlertRuleInput | null;
  editing: boolean;
  onSave(): void;
  pending: boolean;
  setDraft(value: AlertRuleInput | null): void;
}) {
  const { t } = useI18n();
  if (!draft) return null;
  const update = (changes: Partial<AlertRuleInput>) => setDraft({ ...draft, ...changes });
  const scope = scopeLabel(draft, t("alerts.rules.scopeAll"));
  return (
    <Dialog onOpenChange={(open) => { if (!open && !pending) setDraft(null); }} open>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{editing ? t("alerts.rules.edit") : t("alerts.rules.create")}</DialogTitle><DialogDescription>{t("alerts.rules.description")}</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2" label={t("alerts.rules.name")}><Input maxLength={120} onChange={(event) => update({ name: event.currentTarget.value })} value={draft.name} /></Field>
          <Field label={t("alerts.rules.metric")}><select className="h-9 rounded-md border bg-background px-3" onChange={(event) => update({ metric: event.currentTarget.value as AlertRuleMetric })} value={draft.metric}>{(["cpu_pct", "mem_pct", "restart_count", "pod_not_ready"] as const).map((metric) => <option key={metric} value={metric}>{metricLabel(metric, t)}</option>)}</select></Field>
          <Field label={t("alerts.rules.comparator")}><select className="h-9 rounded-md border bg-background px-3" onChange={(event) => update({ comparator: event.currentTarget.value as AlertRuleInput["comparator"] })} value={draft.comparator}>{[">", ">=", "<", "<="].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
          <Field label={t("alerts.rules.threshold")}><Input min={0} onChange={(event) => update({ threshold: Number(event.currentTarget.value) })} type="number" value={draft.threshold} /></Field>
          <Field label={t("alerts.rules.duration")}><Input max={86400} min={1} onChange={(event) => update({ forSeconds: Number(event.currentTarget.value) })} type="number" value={draft.forSeconds} /></Field>
          <Field label={t("alerts.rules.severity")}><select className="h-9 rounded-md border bg-background px-3" onChange={(event) => update({ severity: event.currentTarget.value as AlertRuleInput["severity"] })} value={draft.severity}>{(["critical", "high", "medium", "low"] as const).map((severity) => <option key={severity} value={severity}>{t(`alerts.severity.${severity}`)}</option>)}</select></Field>
          <div className="min-w-0 rounded-lg border bg-muted/20 p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">{t("alerts.rules.scope")}</p><p className="mt-1 truncate text-sm font-medium" title={scope}>{scope}</p></div>
          <AlertRuleChannelsField onChange={(channels) => update({ channels })} port={channelsPort} selected={draft.channels} />
        </div>
        <DialogFooter><Button disabled={pending} onClick={() => setDraft(null)} variant="outline">{t("alerts.rules.cancel")}</Button><Button disabled={pending || !validDraft(draft)} onClick={onSave}>{pending ? <Spinner /> : null}{pending ? t("alerts.rules.saving") : t("alerts.rules.save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ children, className = "", label }: { children: ReactNode; className?: string; label: string }) {
  return <Label className={`grid gap-1.5 ${className}`}><span>{label}</span>{children}</Label>;
}

function RuleFact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 truncate font-medium" title={value}>{value}</dd></div>;
}

function metricLabel(metric: AlertRuleMetric, t: ReturnType<typeof useI18n>["t"]): string {
  const keys: Record<AlertRuleMetric, AlertsMessageKey> = {
    cpu_pct: "alerts.rules.metric.cpu",
    mem_pct: "alerts.rules.metric.memory",
    restart_count: "alerts.rules.metric.restarts",
    pod_not_ready: "alerts.rules.metric.notReady",
  };
  return t(keys[metric]);
}

function metricUnit(metric: AlertRuleMetric): string { return metric === "cpu_pct" || metric === "mem_pct" ? "%" : ""; }

function scopeLabel(rule: Pick<AlertRuleInput, "scope">, fallback: string): string {
  return [...rule.scope.clusters, ...rule.scope.namespaces, ...rule.scope.applications, ...rule.scope.labels].join(" · ") || fallback;
}

function validDraft(draft: AlertRuleInput): boolean {
  return draft.name.trim().length > 0 && Number.isFinite(draft.threshold) && draft.threshold >= 0 && Number.isInteger(draft.forSeconds) && draft.forSeconds > 0;
}
