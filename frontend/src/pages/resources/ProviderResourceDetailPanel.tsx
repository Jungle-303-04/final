import type { MessageKey, TranslationFunction } from "../../shared/i18n";
import { useI18n } from "../../shared/i18n";
import { desktopBridge } from "../../desktop/desktopBridge";
import { StatusMark, type StatusTone } from "../../shared/ui/StatusMark";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Collapse, CollapseChevron } from "../../shared/ui/primitives/collapse";
import { Input } from "../../shared/ui/primitives/input";
import { Progress } from "../../shared/ui/primitives/progress";
import type {
  ProviderCondition,
  ProviderResourceDetail,
} from "../../features/resources/providerResourceContract";
import type {
  ResourceMetricFreshness,
  ResourceMetricSource,
} from "../../features/resources/resourceMetricsHistoryContract";
import type { ResourcesFilterCompleteness } from "../../features/resources/resourcesFilterContract";
import { DefinitionGrid } from "./ResourceFactsPanel";
import {
  SbomComponentsPanel,
  VulnerabilityReportPanel,
} from "./ProviderSecurityReportPanels";
import { useMemo, useState } from "react";
import type { ResourceMetricsHistoryFrame } from "./useResourceMetricsHistoryDataFrame";

interface ProviderSection {
  id: string;
  label: MessageKey;
  rows: Array<[MessageKey, string | null]>;
}

export function ProviderResourceDetailPanel({
  detail,
  metricHistory,
  onOpenExternalUrl = desktopBridge.openExternalUrl,
  resourceId,
}: {
  detail: ProviderResourceDetail;
  metricHistory?: ResourceMetricsHistoryFrame;
  onOpenExternalUrl?: (url: string) => Promise<void>;
  resourceId?: string;
}) {
  const { t } = useI18n();
  const sections = providerSections(detail, t)
    .map((section) => ({
      ...section,
      rows: section.rows.filter((row): row is [MessageKey, string] => row[1] !== null),
    }))
    .filter((section) => section.rows.length > 0);
  return (
    <section
      aria-labelledby="resource-provider-detail-title"
      className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs"
      data-provider-detail={detail.type}
    >
      <h3 className="font-heading font-medium" id="resource-provider-detail-title">
        {t("resources.detail.provider.title")}
      </h3>
      {sections.map((section) => (
        <section aria-labelledby={`provider-section-${section.id}`} className="grid gap-2" key={section.id}>
          <h4 className="text-sm font-medium" id={`provider-section-${section.id}`}>
            {t(section.label)}
          </h4>
          <DefinitionGrid entries={section.rows.map(([label, value]) => [t(label), value])} />
        </section>
      ))}
      {detail.type === "persistent-volume-claim" ? (
        <PvcObservedUsagePanel frame={metricHistory} resourceId={resourceId} />
      ) : null}
      {detail.type === "cluster-compliance-report" ? (
        <ComplianceControlsPanel detail={detail} />
      ) : null}
      {
        detail.type === "grpc-route" ||
        detail.type === "http-route" ||
        detail.type === "tcp-route" ||
        detail.type === "tls-route"
      ? (
        <GatewayRouteRulesPanel detail={detail} />
      ) : null}
      {detail.type === "keda-scaled-object" || detail.type === "keda-scaled-job" ? (
        <KedaTriggersPanel detail={detail} />
      ) : null}
      {detail.type === "prometheus-rule" ? (
        <PrometheusRuleGroupsPanel detail={detail} />
      ) : null}
      {detail.type === "workflow" ? <WorkflowExecutionPanel detail={detail} /> : null}
      {detail.type === "sbom-report" ? <SbomComponentsPanel detail={detail} /> : null}
      {detail.type === "vulnerability-report" ? (
        <VulnerabilityReportPanel
          detail={detail}
          onOpenExternalUrl={onOpenExternalUrl}
        />
      ) : null}
      {detail.conditions.length > 0 ? <ProviderConditions conditions={detail.conditions} /> : null}
    </section>
  );
}

function PvcObservedUsagePanel({
  frame,
  resourceId,
}: {
  frame?: ResourceMetricsHistoryFrame;
  resourceId?: string;
}) {
  const { formatNumber, t } = useI18n();
  const evidence = pvcObservedUsage(frame, resourceId);
  const evidenceRows: Array<[string, string]> = [
    ...(evidence.ratioPercent === null
      ? []
      : [[
          t("resources.detail.provider.pvcUsedRatio"),
          `${formatNumber(evidence.ratioPercent, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}%`,
        ] as [string, string]]),
    [t("resources.detail.provider.metricSource"), metricSourceLabel(evidence.source, t)],
    [t("resources.detail.provider.metricFreshness"), metricFreshnessLabel(evidence.freshness, t)],
    ...(evidence.observedAt === null
      ? []
      : [[t("resources.detail.provider.metricObservedAt"), evidence.observedAt] as [string, string]]),
    ...(evidence.reasonCodes.length === 0
      ? []
      : [[
          t("resources.detail.provider.metricReasons"),
          evidence.reasonCodes.join(" · "),
        ] as [string, string]]),
  ];
  return (
    <section aria-labelledby="provider-pvc-observed-usage" className="grid gap-2">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h4 className="text-sm font-medium" id="provider-pvc-observed-usage">
          {t("resources.detail.provider.pvcObservedUsage")}
        </h4>
        <Badge variant="outline">
          {metricCompletenessLabel(evidence.completeness, t)}
        </Badge>
      </div>
      {evidence.ratioPercent === null ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          {t("resources.detail.provider.metricUnavailable")}
        </p>
      ) : null}
      <DefinitionGrid entries={evidenceRows} />
    </section>
  );
}

interface PvcObservedUsageEvidence {
  ratioPercent: number | null;
  source: ResourceMetricSource | null;
  freshness: ResourceMetricFreshness | null;
  completeness: ResourcesFilterCompleteness;
  observedAt: string | null;
  reasonCodes: string[];
}

function pvcObservedUsage(
  frame: ResourceMetricsHistoryFrame | undefined,
  resourceId: string | undefined,
): PvcObservedUsageEvidence {
  if (frame?.phase !== "ready" || resourceId === undefined) {
    return unavailablePvcUsage();
  }
  const series = frame.data.series.find((item) => item.resourceId === resourceId);
  const point = series === undefined
    ? undefined
    : [...series.points].reverse().find((item) => (
        item.volumeUsagePercent !== null &&
        item.volumeUsagePercent !== undefined &&
        Number.isFinite(item.volumeUsagePercent) &&
        item.volumeUsagePercent >= 0
      ));
  const completeness = series?.completeness ?? frame.data.completeness;
  return {
    ratioPercent: point?.volumeUsagePercent ?? null,
    source: series?.source ?? frame.data.source ?? null,
    freshness: series?.freshness ?? frame.data.sourceFreshness ?? null,
    completeness,
    observedAt: point?.observedAt ?? null,
    reasonCodes: Array.from(new Set([
      ...frame.data.partialReasonCodes,
      ...(series?.partialReasonCodes ?? []),
    ])),
  };
}

function unavailablePvcUsage(): PvcObservedUsageEvidence {
  return {
    ratioPercent: null,
    source: null,
    freshness: null,
    completeness: "unavailable",
    observedAt: null,
    reasonCodes: [],
  };
}

function metricSourceLabel(
  source: PvcObservedUsageEvidence["source"],
  t: TranslationFunction,
): string {
  if (source === "prometheus") return t("resources.detail.provider.metricSourcePrometheus");
  if (source === "kubernetes") return t("resources.detail.provider.metricSourceKubernetes");
  return t("resources.detail.provider.metricUnavailableShort");
}

function metricFreshnessLabel(
  freshness: PvcObservedUsageEvidence["freshness"],
  t: TranslationFunction,
): string {
  const key: MessageKey = freshness === "live"
    ? "resources.detail.provider.metricFreshnessLive"
    : freshness === "stale"
      ? "resources.detail.provider.metricFreshnessStale"
      : freshness === "partial"
        ? "resources.detail.provider.metricFreshnessPartial"
        : freshness === "disconnected"
          ? "resources.detail.provider.metricFreshnessDisconnected"
          : "resources.detail.provider.metricUnavailableShort";
  return t(key);
}

function metricCompletenessLabel(
  completeness: PvcObservedUsageEvidence["completeness"],
  t: TranslationFunction,
): string {
  return t(completeness === "exact"
    ? "resources.detail.provider.metricCompletenessExact"
    : completeness === "partial"
      ? "resources.detail.provider.metricCompletenessPartial"
      : "resources.detail.provider.metricCompletenessUnavailable");
}

type ComplianceDetail = Extract<ProviderResourceDetail, { type: "cluster-compliance-report" }>;
type GatewayRouteDetail = Extract<
  ProviderResourceDetail,
  { type: "grpc-route" | "http-route" | "tcp-route" | "tls-route" }
>;
type KedaDetail = Extract<
  ProviderResourceDetail,
  { type: "keda-scaled-object" | "keda-scaled-job" }
>;
type PrometheusRuleDetail = Extract<ProviderResourceDetail, { type: "prometheus-rule" }>;
type WorkflowDetail = Extract<ProviderResourceDetail, { type: "workflow" }>;

function WorkflowExecutionPanel({ detail }: { detail: WorkflowDetail }) {
  const { t } = useI18n();
  if (detail.executionNodes.length === 0 && detail.problemSummaries.length === 0) return null;
  return (
    <section aria-labelledby="provider-workflow-execution" className="grid gap-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h4 className="text-sm font-medium" id="provider-workflow-execution">
          {t("resources.detail.provider.execution")}
        </h4>
        <Badge variant="outline">
          {t("resources.detail.provider.nodeProjectionCount", {
            count: detail.projectedNodeCount,
            total: detail.observedNodeCount,
          })}
        </Badge>
      </div>
      {detail.problemSummaries.length > 0 ? (
        <ul className="grid gap-2 rounded-lg border border-destructive/35 bg-destructive/5 p-3">
          {detail.problemSummaries.map((summary) => (
            <li className="text-sm text-destructive [overflow-wrap:anywhere]" key={summary}>
              {summary}
            </li>
          ))}
        </ul>
      ) : null}
      <ol className="grid gap-2">
        {detail.executionNodes.map((node) => (
          <li
            className="grid min-w-0 gap-1 rounded-lg border bg-background/65 px-3 py-2.5"
            data-workflow-node={node.id}
            key={node.id}
            style={{ marginInlineStart: `${Math.min(node.depth, 6) * 0.75}rem` }}
          >
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium" title={node.label}>
                {node.label}
              </span>
              <StatusMark label={node.phase} tone={workflowNodeTone(node.phase)} />
            </div>
            <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{node.nodeType}</span>
              {node.templateRef ? <span>{namedReferenceLabel(node.templateRef)}</span> : null}
              {node.startedAt ? <span>{node.startedAt}</span> : null}
              {node.finishedAt ? <span>{node.finishedAt}</span> : null}
            </div>
            {node.message ? (
              <p className="line-clamp-2 text-xs text-destructive [overflow-wrap:anywhere]" title={node.message}>
                {node.message}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ComplianceControlsPanel({ detail }: { detail: ComplianceDetail }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const controls = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return detail.controls.filter((control) => {
      if (failedOnly && (control.totalFail ?? 0) === 0) return false;
      if (!normalized) return true;
      return [control.id, control.name, control.description]
        .filter((value): value is string => value !== null)
        .some((value) => value.toLocaleLowerCase().includes(normalized));
    });
  }, [detail.controls, failedOnly, query]);
  const total = (detail.passCount ?? 0) + (detail.failCount ?? 0);
  const compliance = total > 0 && detail.passCount !== null
    ? Math.round((detail.passCount / total) * 100)
    : null;
  if (detail.controls.length === 0) return null;
  return (
    <section aria-labelledby="provider-compliance-controls" className="grid gap-3">
      <div className="grid gap-2">
        <h4 className="text-sm font-medium" id="provider-compliance-controls">
          {t("resources.detail.provider.controls")}
        </h4>
        {compliance === null ? null : (
          <Progress
            aria-label={t("resources.detail.provider.compliance")}
            value={compliance}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <Input
          aria-label={t("resources.detail.provider.controlSearch")}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("resources.detail.provider.controlSearchPlaceholder")}
          type="search"
          value={query}
        />
        <Button
          aria-pressed={failedOnly}
          onClick={() => setFailedOnly((value) => !value)}
          size="sm"
          type="button"
          variant={failedOnly ? "secondary" : "outline"}
        >
          {t("resources.detail.provider.failedOnly")}
        </Button>
      </div>
      {query || failedOnly ? (
        <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{t("resources.detail.provider.controlResults", {
            count: controls.length,
            total: detail.controls.length,
          })}</span>
          <Button
            onClick={() => { setQuery(""); setFailedOnly(false); }}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("resources.detail.provider.clearFilters")}
          </Button>
        </div>
      ) : null}
      {controls.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          {t("resources.detail.provider.noControlResults")}
        </p>
      ) : (
        <ul className="grid gap-2">
          {controls.map((control, index) => {
            const open = expanded.has(control.id);
            const failed = (control.totalFail ?? 0) > 0;
            const contentId = `provider-control-${index}-${safeId(control.id)}`;
            return (
              <li className="min-w-0 rounded-lg border bg-background/65" key={control.id}>
                <button
                  aria-controls={contentId}
                  aria-expanded={open}
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left"
                  onClick={() => setExpanded((current) => toggleSet(current, control.id))}
                  type="button"
                >
                  <CollapseChevron className="size-4" open={open} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {control.name ?? control.id}
                  </span>
                  {control.severity ? <Badge variant="outline">{control.severity}</Badge> : null}
                  <StatusMark
                    label={failed
                      ? t("resources.detail.provider.controlFailed")
                      : t("resources.detail.provider.controlPassed")}
                    tone={failed ? "critical" : "healthy"}
                  />
                </button>
                <Collapse mountLazily open={open}>
                  <div className="grid gap-2 border-t px-3 py-3" id={contentId}>
                    <DefinitionGrid entries={[
                      [t("resources.detail.provider.controlId"), control.id],
                      ...(control.description
                        ? [[t("resources.detail.provider.description"), control.description] as [string, string]]
                        : []),
                      ...(control.totalPass === null
                        ? []
                        : [[t("resources.detail.provider.passCount"), String(control.totalPass)] as [string, string]]),
                      ...(control.totalFail === null
                        ? []
                        : [[t("resources.detail.provider.failCount"), String(control.totalFail)] as [string, string]]),
                      ...(control.checkIds.length === 0
                        ? []
                        : [[t("resources.detail.provider.checkIds"), control.checkIds.join(" · ")] as [string, string]]),
                    ]} />
                  </div>
                </Collapse>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function GatewayRouteRulesPanel({ detail }: { detail: GatewayRouteDetail }) {
  const { t } = useI18n();
  if (detail.rules.length === 0) return null;
  return (
    <section aria-labelledby="provider-route-rules" className="grid gap-3">
      <h4 className="text-sm font-medium" id="provider-route-rules">
        {t("resources.detail.provider.routeRules")}
      </h4>
      <ol className="grid gap-3">
        {detail.rules.map((rule, index) => (
          <li className="grid min-w-0 gap-3 rounded-lg border bg-background/65 p-3" key={index}>
            <h5 className="text-sm font-medium">
              {t("resources.detail.provider.routeRule", { count: index + 1 })}
            </h5>
            <DefinitionGrid entries={[
              [
                t("resources.detail.provider.routeMatches"),
                rule.matches.length > 0
                  ? rule.matches.map((match) => formatGatewayRouteMatch(match, t)).join(" · ")
                  : t("resources.detail.provider.matchAll"),
              ],
              [
                t("resources.detail.provider.routeBackends"),
                rule.backends.length > 0
                  ? rule.backends.map((backend) => formatGatewayRouteBackend(backend, t)).join(" · ")
                  : t("resources.detail.provider.none"),
              ],
              [
                t("resources.detail.provider.routeFilters"),
                rule.filters.length > 0
                  ? rule.filters.map((filter) => join([filter.type, filter.summary]) ?? filter.type).join(" · ")
                  : t("resources.detail.provider.none"),
              ],
            ]} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function KedaTriggersPanel({ detail }: { detail: KedaDetail }) {
  const { t } = useI18n();
  if (detail.triggers.length === 0) return null;
  return (
    <section aria-labelledby="provider-keda-triggers" className="grid gap-3">
      <h4 className="text-sm font-medium" id="provider-keda-triggers">
        {t("resources.detail.provider.triggers")}
      </h4>
      <ul className="grid gap-2">
        {detail.triggers.map((trigger, index) => (
          <li className="grid gap-2 rounded-lg border bg-background/65 p-3" key={`${trigger.type}-${index}`}>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="font-medium">{trigger.type}</span>
              {trigger.name ? <Badge variant="outline">{trigger.name}</Badge> : null}
            </div>
            <DefinitionGrid entries={[
              ...(trigger.authenticationRef
                ? [[
                    t("resources.detail.provider.authenticationReference"),
                    namedReferenceLabel(trigger.authenticationRef) ?? trigger.authenticationRef.name,
                  ] as [string, string]]
                : []),
              ...(trigger.metadataKeys.length > 0
                ? [[
                    t("resources.detail.provider.metadataFields"),
                    trigger.metadataKeys.join(" · "),
                  ] as [string, string]]
                : []),
              ...(trigger.redactedMetadataCount > 0
                ? [[
                    t("resources.detail.provider.redactedValues"),
                    t("resources.detail.provider.redactedValueCount", {
                      count: trigger.redactedMetadataCount,
                    }),
                  ] as [string, string]]
                : []),
            ]} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PrometheusRuleGroupsPanel({ detail }: { detail: PrometheusRuleDetail }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(
    detail.groups
      .map((group, index) => ({ group, key: `${index}:${group.name}` }))
      .filter(({ group }) => group.rules.length <= 10)
      .map(({ key }) => key),
  ));
  const normalized = query.trim().toLocaleLowerCase();
  const groups = useMemo(() => detail.groups.map((group, index) => ({
    ...group,
    key: `${index}:${group.name}`,
    rules: normalized
      ? group.rules.filter((rule) => [
          rule.name,
          rule.expression,
          rule.severity,
          rule.summary,
          rule.description,
        ].filter((value): value is string => value !== null)
          .some((value) => value.toLocaleLowerCase().includes(normalized)))
      : group.rules,
  })).filter((group) => group.rules.length > 0), [detail.groups, normalized]);
  if (detail.groups.length === 0) return null;
  return (
    <section aria-labelledby="provider-prometheus-rule-groups" className="grid gap-3">
      <h4 className="text-sm font-medium" id="provider-prometheus-rule-groups">
        {t("resources.detail.provider.ruleGroups")}
      </h4>
      {detail.totalRules > 5 ? (
        <Input
          aria-label={t("resources.detail.provider.ruleSearch")}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("resources.detail.provider.ruleSearchPlaceholder")}
          type="search"
          value={query}
        />
      ) : null}
      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          {t("resources.detail.provider.noRuleResults")}
        </p>
      ) : (
        <ul className="grid gap-2">
          {groups.map((group) => {
            const open = normalized.length > 0 || expanded.has(group.key);
            const contentId = `provider-rule-group-${safeId(group.key)}`;
            return (
              <li className="rounded-lg border bg-background/65" key={group.key}>
                <button
                  aria-controls={contentId}
                  aria-expanded={open}
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left"
                  onClick={() => setExpanded((current) => toggleSet(current, group.key))}
                  type="button"
                >
                  <CollapseChevron className="size-4" open={open} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {group.name}
                  </span>
                  {group.interval ? <Badge variant="outline">{group.interval}</Badge> : null}
                  <span className="text-xs text-muted-foreground">
                    {t("resources.detail.provider.ruleResultCount", {
                      count: group.rules.length,
                      total: group.ruleCount,
                    })}
                  </span>
                </button>
                <Collapse mountLazily open={open}>
                  <ol className="grid gap-2 border-t p-3" id={contentId}>
                    {group.rules.map((rule, index) => (
                      <li className="grid gap-2 rounded-lg border bg-card p-3" key={`${rule.type}-${rule.name}-${index}`}>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
                            {rule.name}
                          </span>
                          <Badge variant="outline">
                            {t(rule.type === "alert"
                              ? "resources.detail.provider.alertRule"
                              : "resources.detail.provider.recordingRule")}
                          </Badge>
                          {rule.severity ? <Badge variant="outline">{rule.severity}</Badge> : null}
                          {rule.duration ? <span className="text-xs text-muted-foreground">{rule.duration}</span> : null}
                        </div>
                        {rule.summary || rule.description ? (
                          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                            {rule.summary ?? rule.description}
                          </p>
                        ) : null}
                        <PrometheusExpression expression={rule.expression} />
                        {rule.labels.length > 0 ? (
                          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                            {formatKeyValues(rule.labels)}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </Collapse>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PrometheusExpression({ expression }: { expression: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const truncated = expression.length > 200;
  return (
    <div className="grid gap-1">
      <pre className="whitespace-pre-wrap rounded-md bg-muted px-2 py-1.5 font-mono text-xs [overflow-wrap:anywhere]">
        {expanded || !truncated ? expression : `${expression.slice(0, 200)}…`}
      </pre>
      {truncated ? (
        <Button
          className="w-fit"
          onClick={() => setExpanded((value) => !value)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t(expanded
            ? "resources.detail.provider.showLess"
            : "resources.detail.provider.showMore")}
        </Button>
      ) : null}
    </div>
  );
}

function ProviderConditions({ conditions }: { conditions: ProviderCondition[] }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="provider-conditions-title" className="grid gap-2">
      <h4 className="text-sm font-medium" id="provider-conditions-title">
        {t("resources.detail.provider.conditions")}
      </h4>
      <ul className="grid gap-2">
        {conditions.map((condition) => (
          <li className="grid min-w-0 gap-1 rounded-lg border bg-background/65 px-3 py-2.5" key={condition.type}>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium" title={condition.type}>
                {condition.type}
              </span>
              <StatusMark
                label={condition.reason ?? condition.status}
                tone={condition.status === "True" ? "healthy" : condition.status === "False" ? "critical" : "unknown"}
              />
            </div>
            {condition.message ? (
              <p className="whitespace-pre-wrap text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {condition.message}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function providerSections(
  detail: ProviderResourceDetail,
  t: TranslationFunction,
): ProviderSection[] {
  if (detail.type === "aws-machine") return [
    section("instance", "resources.detail.provider.overview", [
      ["resources.detail.provider.instanceType", detail.instanceType],
      ["resources.detail.provider.instanceId", detail.instanceId],
      ["resources.detail.provider.instanceState", detail.instanceState],
      ["resources.detail.provider.providerId", detail.providerId],
    ]),
    section("configuration", "resources.detail.provider.configuration", [
      ["resources.detail.provider.iamProfile", detail.iamInstanceProfile],
      ["resources.detail.provider.sshKey", detail.sshKeyName],
      ["resources.detail.provider.subnet", detail.subnetId],
      ["resources.detail.provider.secretsBackend", detail.secretsBackend],
    ]),
    section("addresses", "resources.detail.provider.addresses", [
      ["resources.detail.provider.addresses", join(detail.addresses.map((item) => `${item.type}: ${item.address}`))],
    ]),
  ];
  if (detail.type === "aws-managed-cluster") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.endpoint", detail.endpoint],
      ["resources.detail.provider.failureDomains", join(detail.failureDomains)],
    ]),
  ];
  if (detail.type === "aws-managed-control-plane") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.clusterName", detail.clusterName],
      ["resources.detail.provider.region", detail.region],
      ["resources.detail.provider.version", detail.version],
      ["resources.detail.provider.endpointAccess", detail.endpointAccess],
      ["resources.detail.provider.role", detail.roleName],
      ["resources.detail.provider.identity", detail.identity],
    ]),
    section("network", "resources.detail.provider.network", [
      ["resources.detail.provider.vpc", detail.vpcId],
      ["resources.detail.provider.cidr", detail.vpcCidrBlock],
      ["resources.detail.provider.subnets", join(detail.subnets.map(formatAwsSubnet))],
      ["resources.detail.provider.securityGroups", join(detail.securityGroups.map((item) => join([item.role, item.id, item.name])!).filter(Boolean))],
      ["resources.detail.provider.addresses", join(detail.natGatewayIps)],
      ["resources.detail.provider.failureDomains", join(detail.failureDomains)],
    ]),
    section("addons", "resources.detail.provider.addons", [
      ["resources.detail.provider.addons", join(detail.addons.map((item) => join([item.name, item.currentVersion ?? item.requestedVersion, item.status])!).filter(Boolean))],
    ]),
  ];
  if (detail.type === "aws-managed-machine-pool") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.nodeGroup", detail.nodeGroupName],
      ["resources.detail.provider.instanceType", detail.instanceType],
      ["resources.detail.provider.amiType", detail.amiType],
      ["resources.detail.provider.capacityType", detail.capacityType],
      ["resources.detail.provider.role", detail.roleName],
    ]),
    scalingSection(detail.scaling, detail.maxUnavailable),
    section("configuration", "resources.detail.provider.configuration", [
      ["resources.detail.provider.subnets", join(detail.subnetIds)],
      ["resources.detail.provider.labels", join(detail.labels.map(({ key, value }) => `${key}=${value}`))],
    ]),
  ];
  if (detail.type === "azure-machine") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.vmSize", detail.vmSize],
      ["resources.detail.provider.availabilityZone", detail.availabilityZone],
      ["resources.detail.provider.osType", detail.osType],
      ["resources.detail.provider.osDisk", numberWithUnit(detail.osDiskSizeGb, "GB")],
      ["resources.detail.provider.providerId", detail.providerId],
      ["resources.detail.provider.subnet", detail.subnetName],
    ]),
  ];
  if (detail.type === "azure-managed-control-plane") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.location", detail.location],
      ["resources.detail.provider.resourceGroup", detail.resourceGroupName],
      ["resources.detail.provider.version", detail.version],
      ["resources.detail.provider.skuTier", detail.skuTier],
      ["resources.detail.provider.dnsPrefix", detail.dnsPrefix],
      ["resources.detail.provider.subscription", detail.subscriptionId],
    ]),
    section("network", "resources.detail.provider.network", [
      ["resources.detail.provider.networkPlugin", detail.networkPlugin],
      ["resources.detail.provider.networkPolicy", detail.networkPolicy],
      ["resources.detail.provider.privateCluster", yesNo(detail.privateCluster, t)],
      ["resources.detail.provider.dnsServiceIp", detail.dnsServiceIp],
      ["resources.detail.provider.loadBalancerSku", detail.loadBalancerSku],
      ["resources.detail.provider.authorizedRanges", join(detail.authorizedIpRanges)],
    ]),
    section("upgrade", "resources.detail.provider.configuration", [
      ["resources.detail.provider.upgradeChannel", detail.upgradeChannel],
    ]),
  ];
  if (detail.type === "capi-cluster") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.phase", detail.phase],
      ["resources.detail.provider.version", detail.version],
      ["resources.detail.provider.clusterClass", detail.clusterClass],
      ["resources.detail.provider.endpoint", detail.endpoint],
      ["resources.detail.provider.provider", detail.provider],
      ["resources.detail.provider.paused", yesNo(detail.paused, t)],
    ]),
    replicaSection("control-plane", "resources.detail.provider.controlPlane", detail.controlPlane),
    replicaSection("workers", "resources.detail.provider.workers", detail.workers),
    section("references", "resources.detail.provider.references", [
      ["resources.detail.provider.controlPlane", referenceLabel(detail.controlPlaneRef)],
      ["resources.detail.provider.infrastructure", referenceLabel(detail.infrastructureRef)],
    ]),
  ];
  if (detail.type === "capi-kubeadm-control-plane") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.clusterName", detail.clusterName],
      ["resources.detail.provider.version", detail.version],
      ["resources.detail.provider.initialized", yesNo(detail.initialized, t)],
      ["resources.detail.provider.updateStrategy", detail.updateStrategy],
    ]),
    replicaSection("replicas", "resources.detail.provider.scaling", detail.replicas),
    section("configuration", "resources.detail.provider.configuration", [
      ["resources.detail.provider.infrastructure", referenceLabel(detail.infrastructureRef)],
      ["resources.detail.provider.nodeDrainTimeout", detail.nodeDrainTimeout],
      ["resources.detail.provider.volumeDetachTimeout", detail.nodeVolumeDetachTimeout],
      ["resources.detail.provider.deletionTimeout", detail.nodeDeletionTimeout],
      ["resources.detail.provider.certificateSans", join(detail.certificateSans)],
    ]),
    section("remediation", "resources.detail.provider.remediation", [
      ["resources.detail.provider.nodeName", detail.remediationMachine],
      ["resources.detail.provider.retryCount", number(detail.remediationRetryCount)],
      ["resources.detail.provider.timestamp", detail.remediationTimestamp],
    ]),
  ];
  if (detail.type === "capi-machine-deployment") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.phase", detail.phase],
      ["resources.detail.provider.clusterName", detail.clusterName],
      ["resources.detail.provider.version", detail.version],
      ["resources.detail.provider.paused", yesNo(detail.paused, t)],
    ]),
    replicaSection("replicas", "resources.detail.provider.scaling", detail.replicas),
    section("strategy", "resources.detail.provider.strategy", [
      ["resources.detail.provider.strategy", detail.strategyType],
      ["resources.detail.provider.maxSurge", detail.maxSurge],
      ["resources.detail.provider.maxUnavailable", detail.maxUnavailable],
    ]),
    referencesSection(detail.bootstrapRef, detail.infrastructureRef),
  ];
  if (detail.type === "capi-machine-health-check") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.clusterName", detail.clusterName],
      ["resources.detail.provider.expectedMachines", number(detail.expectedMachines)],
      ["resources.detail.provider.currentHealthy", number(detail.currentHealthy)],
      ["resources.detail.provider.remediationsAllowed", number(detail.remediationsAllowed)],
      ["resources.detail.provider.nodeStartupTimeout", detail.nodeStartupTimeout],
      ["resources.detail.provider.maxUnhealthy", detail.maxUnhealthy],
      ["resources.detail.provider.unhealthyRange", detail.unhealthyRange],
    ]),
    section("selector", "resources.detail.provider.selector", [
      ["resources.detail.provider.selector", join(detail.selector.map(({ key, value }) => `${key}=${value}`))],
    ]),
    section("unhealthy", "resources.detail.provider.unhealthyConditions", [
      ["resources.detail.provider.unhealthyConditions", join(detail.unhealthyConditions.map((item) => join([item.type, item.status, item.timeout])!).filter(Boolean))],
      ["resources.detail.provider.remediation", referenceLabel(detail.remediationTemplate)],
    ]),
  ];
  if (detail.type === "capi-machine-pool") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.phase", detail.phase],
      ["resources.detail.provider.clusterName", detail.clusterName],
      ["resources.detail.provider.minReadySeconds", number(detail.minReadySeconds)],
    ]),
    replicaSection("replicas", "resources.detail.provider.scaling", detail.replicas),
    referencesSection(detail.bootstrapRef, detail.infrastructureRef),
  ];
  if (detail.type === "capi-machine") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.phase", detail.phase],
      ["resources.detail.provider.role", detail.role],
      ["resources.detail.provider.clusterName", detail.clusterName],
      ["resources.detail.provider.version", detail.version],
      ["resources.detail.provider.failureDomain", detail.failureDomain],
      ["resources.detail.provider.provider", detail.provider],
    ]),
    section("infrastructure", "resources.detail.provider.infrastructure", [
      ["resources.detail.provider.providerId", detail.providerId],
      ["resources.detail.provider.region", detail.providerRegion],
      ["resources.detail.provider.instanceId", detail.providerInstanceId],
      ["resources.detail.provider.addresses", join(detail.addresses.map((item) => `${item.type}: ${item.address}`))],
    ]),
    section("node", "resources.detail.provider.node", [
      ["resources.detail.provider.nodeName", detail.nodeName],
      ["resources.detail.provider.nodeUid", detail.nodeUid],
      ["resources.detail.provider.osImage", detail.osImage],
      ["resources.detail.provider.architecture", detail.architecture],
      ["resources.detail.provider.kernel", detail.kernelVersion],
      ["resources.detail.provider.containerRuntime", detail.containerRuntimeVersion],
      ["resources.detail.provider.kubelet", detail.kubeletVersion],
    ]),
    referencesSection(detail.bootstrapRef, detail.infrastructureRef),
  ];
  if (detail.type === "capi-machine-set") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.clusterName", detail.clusterName],
      ["resources.detail.provider.deletePolicy", detail.deletePolicy],
      ["resources.detail.provider.minReadySeconds", number(detail.minReadySeconds)],
    ]),
    replicaSection("replicas", "resources.detail.provider.scaling", detail.replicas),
    referencesSection(detail.bootstrapRef, detail.infrastructureRef),
  ];
  if (detail.type === "certificate") return [
    section("certificate", "resources.detail.provider.certificate", [
      ["resources.detail.provider.statusReady", yesNo(detail.ready, t)],
      ["resources.detail.provider.secretName", detail.secretName],
      ["resources.detail.provider.revision", number(detail.revision)],
      ["resources.detail.provider.isCa", yesNo(detail.isCa, t)],
      ["resources.detail.provider.failedAttempts", number(detail.failedIssuanceAttempts)],
      ["resources.detail.provider.lastFailure", detail.lastFailureTime],
    ]),
    section("validity", "resources.detail.provider.validity", [
      ["resources.detail.provider.duration", detail.duration],
      ["resources.detail.provider.renewBefore", detail.renewBefore],
      ["resources.detail.provider.notBefore", detail.notBefore],
      ["resources.detail.provider.notAfter", detail.notAfter],
      ["resources.detail.provider.renewalTime", detail.renewalTime],
    ]),
    section("private-key", "resources.detail.provider.privateKey", [
      ["resources.detail.provider.algorithm", detail.privateKey?.algorithm ?? null],
      ["resources.detail.provider.size", number(detail.privateKey?.size ?? null)],
      ["resources.detail.provider.encoding", detail.privateKey?.encoding ?? null],
      ["resources.detail.provider.rotationPolicy", detail.privateKey?.rotationPolicy ?? null],
    ]),
    section("certificate-refs", "resources.detail.provider.references", [
      ["resources.detail.provider.dnsNames", join(detail.dnsNames)],
      ["resources.detail.provider.issuer", namedReferenceLabel(detail.issuerRef)],
      ["resources.detail.provider.usages", join(detail.usages)],
    ]),
  ];
  if (detail.type === "certificate-request") return [
    section("request-status", "resources.detail.provider.status", [
      ["resources.detail.provider.statusReady", yesNo(detail.ready, t)],
      ["resources.detail.provider.approved", yesNo(detail.approved, t)],
      ["resources.detail.provider.denied", yesNo(detail.denied, t)],
      ["resources.detail.provider.certificateIssued", yesNo(detail.certificateIssued, t)],
    ]),
    section("request-detail", "resources.detail.provider.configuration", [
      ["resources.detail.provider.duration", detail.duration],
      ["resources.detail.provider.usages", join(detail.usages)],
      ["resources.detail.provider.issuer", namedReferenceLabel(detail.issuerRef)],
      ["resources.detail.provider.ownerCertificate", namedReferenceLabel(detail.ownerCertificate)],
    ]),
  ];
  if (detail.type === "cluster-compliance-report") return [
    section("framework", "resources.detail.provider.complianceFramework", [
      ["resources.detail.provider.framework", detail.frameworkTitle ?? detail.frameworkId],
      ["resources.detail.provider.description", detail.frameworkDescription],
      ["resources.detail.provider.version", detail.frameworkVersion],
      ["resources.detail.provider.platform", detail.platform],
      ["resources.detail.provider.updatedAt", detail.updatedAt],
    ]),
    section("summary", "resources.detail.provider.summary", [
      ["resources.detail.provider.passCount", number(detail.passCount)],
      ["resources.detail.provider.failCount", number(detail.failCount)],
      ["resources.detail.provider.controlCount", number(detail.controls.length)],
    ]),
  ];
  if (detail.type === "crossplane-composite") return [
    section("composite", "resources.detail.provider.composite", [
      ["resources.detail.provider.resourceMode", t(detail.claim
        ? "resources.detail.provider.claim"
        : "resources.detail.provider.compositeResource")],
      ["resources.detail.provider.paused", yesNo(detail.paused, t)],
      ["resources.detail.provider.updateStrategy", detail.compositionUpdatePolicy],
    ]),
    section("composition-refs", "resources.detail.provider.references", [
      ["resources.detail.provider.composition", namedReferenceLabel(detail.compositionRef)],
      ["resources.detail.provider.compositionRevision", namedReferenceLabel(detail.compositionRevisionRef)],
      ["resources.detail.provider.boundResource", namedReferenceLabel(detail.boundResourceRef)],
      ["resources.detail.provider.composedResources", join(detail.composedResourceRefs.map(namedReferenceLabel))],
    ]),
  ];
  if (detail.type === "crossplane-managed-resource") return [
    section("managed-resource", "resources.detail.provider.managedResource", [
      ["resources.detail.provider.kind", detail.kind],
      ["resources.detail.provider.apiGroup", detail.apiGroup],
      ["resources.detail.provider.externalName", detail.externalName],
      ["resources.detail.provider.managementPolicies", join(detail.managementPolicies)],
      ["resources.detail.provider.deletionPolicy", detail.deletionPolicy],
      ["resources.detail.provider.paused", yesNo(detail.paused, t)],
    ]),
    section("managed-resource-refs", "resources.detail.provider.references", [
      ["resources.detail.provider.providerConfiguration", namedReferenceLabel(detail.providerConfigRef)],
      ["resources.detail.provider.composedBy", namedReferenceLabel(detail.composingResourceRef)],
    ]),
    section("managed-resource-fields", "resources.detail.provider.observedFields", [
      ["resources.detail.provider.specFields", join(detail.observedSpecFields)],
      ["resources.detail.provider.statusFields", join(detail.observedStatusFields)],
    ]),
  ];
  if (detail.type === "cron-workflow") return [
    section("schedule", "resources.detail.provider.schedule", [
      ["resources.detail.provider.schedules", join(detail.schedules)],
      ["resources.detail.provider.timezone", detail.timezone],
      ["resources.detail.provider.suspended", yesNo(detail.suspended, t)],
      ["resources.detail.provider.concurrency", detail.concurrencyPolicy],
      ["resources.detail.provider.lastScheduled", detail.lastScheduledTime],
    ]),
    section("workflow-template", "resources.detail.provider.workflowTemplate", [
      ["resources.detail.provider.templateReference", namedReferenceLabel(detail.workflowTemplateRef)],
      ["resources.detail.provider.clusterScope", yesNo(detail.workflowTemplateClusterScope, t)],
      ["resources.detail.provider.entrypoint", detail.entrypoint],
      ["resources.detail.provider.arguments", number(detail.argumentCount)],
      ["resources.detail.provider.templates", number(detail.templateCount)],
    ]),
    section("history", "resources.detail.provider.history", [
      ["resources.detail.provider.successHistory", number(detail.successfulHistoryLimit)],
      ["resources.detail.provider.failedHistory", number(detail.failedHistoryLimit)],
      ["resources.detail.provider.startingDeadline", seconds(detail.startingDeadlineSeconds)],
      ["resources.detail.provider.activeWorkflows", join(detail.activeWorkflows.map(namedReferenceLabel))],
    ]),
  ];
  if (detail.type === "external-secret") return [
    section("sync", "resources.detail.provider.syncStatus", [
      ["resources.detail.provider.statusReady", yesNo(detail.ready, t)],
      ["resources.detail.provider.lastSync", detail.lastSyncTime],
      ["resources.detail.provider.refreshInterval", detail.refreshInterval],
      ["resources.detail.provider.targetSecret", detail.targetName],
      ["resources.detail.provider.syncedVersion", detail.syncedResourceVersion],
      ["resources.detail.provider.binding", detail.bindingName],
    ]),
    section("store", "resources.detail.provider.storeReference", [
      ["resources.detail.provider.storeName", detail.storeName],
      ["resources.detail.provider.storeKind", detail.storeKind],
    ]),
    section("mappings", "resources.detail.provider.secretMappings", [
      ["resources.detail.provider.secretMappings", join(detail.mappings.map(formatSecretMapping))],
      ["resources.detail.provider.dataSources", join(detail.dataSources.map((source) => join([source.type, source.detail])))],
    ]),
    section("target", "resources.detail.provider.targetConfiguration", [
      ["resources.detail.provider.creationPolicy", detail.targetCreationPolicy],
      ["resources.detail.provider.deletionPolicy", detail.targetDeletionPolicy],
      ["resources.detail.provider.templateType", detail.templateType],
      ["resources.detail.provider.engineVersion", detail.templateEngineVersion],
      ["resources.detail.provider.templateLabels", formatKeyValues(detail.templateLabels)],
      ["resources.detail.provider.templateAnnotations", formatKeyValues(detail.templateAnnotations)],
    ]),
  ];
  if (detail.type === "persistent-volume-claim") return [
    section("pvc-status", "resources.detail.provider.storage", [
      ["resources.detail.provider.phase", detail.phase],
      ["resources.detail.provider.capacity", detail.capacity],
      ["resources.detail.provider.requested", detail.requested],
      ["resources.detail.provider.storageClass", detail.storageClassName],
      ["resources.detail.provider.accessModes", join(detail.accessModes)],
      ["resources.detail.provider.volumeMode", detail.volumeMode],
      ["resources.detail.provider.volumeName", detail.volumeName],
    ]),
    section("pvc-provisioning", "resources.detail.provider.provisioning", [
      ["resources.detail.provider.provisioner", detail.provisioner],
      ["resources.detail.provider.selectedNode", detail.selectedNode],
      ["resources.detail.provider.bindCompleted", yesNo(detail.bindCompleted, t)],
    ]),
  ];
  if (detail.type === "sealed-secret") return [
    section("sealed-secret", "resources.detail.provider.sealedSecret", [
      ["resources.detail.provider.synced", yesNo(detail.synced, t)],
      ["resources.detail.provider.targetSecret", detail.targetSecretName],
      ["resources.detail.provider.secretType", detail.secretType],
      ["resources.detail.provider.scope", detail.scope],
      ["resources.detail.provider.observedGeneration", number(detail.observedGeneration)],
      ["resources.detail.provider.encryptedKeys", join(detail.encryptedKeys)],
    ]),
    section("sealed-secret-template", "resources.detail.provider.templateMetadata", [
      ["resources.detail.provider.templateLabels", formatKeyValues(detail.templateLabels)],
      ["resources.detail.provider.templateAnnotations", formatKeyValues(detail.templateAnnotations)],
    ]),
  ];
  if (detail.type === "secret") return [
    section("secret", "resources.detail.provider.secretMetadata", [
      ["resources.detail.provider.secretType", detail.secretType],
      ["resources.detail.provider.immutable", yesNo(detail.immutable, t)],
      ["resources.detail.provider.secretKeys", join(detail.keyNames)],
      ["resources.detail.provider.redactedValues", String(detail.keyNames.length)],
    ]),
  ];
  if (detail.type === "secret-store") return [
    section("secret-store", "resources.detail.provider.storeReference", [
      ["resources.detail.provider.statusReady", yesNo(detail.ready, t)],
      ["resources.detail.provider.scope", detail.clusterScope
        ? t("resources.detail.provider.clusterScope")
        : t("resources.detail.provider.namespaceScope")],
      ["resources.detail.provider.provider", detail.providerType],
      ["resources.detail.provider.controller", detail.controller],
    ]),
    section("secret-store-detail", "resources.detail.provider.configuration", [
      ["resources.detail.provider.providerDetails", formatKeyValues(detail.providerDetails)],
      ["resources.detail.provider.maxRetries", number(detail.maxRetries)],
      ["resources.detail.provider.retryInterval", detail.retryInterval],
    ]),
  ];
  if (detail.type === "workflow") return [
    section("workflow-status", "resources.detail.provider.status", [
      ["resources.detail.provider.phase", detail.phase],
      ["resources.detail.provider.started", detail.startedAt],
      ["resources.detail.provider.finished", detail.finishedAt],
      ["resources.detail.provider.progress", detail.progress],
      ["resources.detail.provider.estimatedDuration", seconds(detail.estimatedDurationSeconds)],
      ["resources.detail.provider.templateReference", namedReferenceLabel(detail.workflowTemplateRef)],
    ]),
    section("workflow-input", "resources.detail.provider.configuration", [
      ["resources.detail.provider.arguments", join(detail.argumentNames)],
      ["resources.detail.provider.resourceUsage", formatKeyValues(detail.resourceDurations)],
      ["resources.detail.provider.truncated", yesNo(detail.truncated, t)],
    ]),
  ];
  if (detail.type === "gateway-class") return [
    section("gateway", "resources.detail.provider.gatewayClass", [
      ["resources.detail.provider.controller", detail.controllerName],
      ["resources.detail.provider.description", detail.description],
      ["resources.detail.provider.accepted", yesNo(detail.accepted, t)],
    ]),
    section("parameters", "resources.detail.provider.parametersReference", [
      ["resources.detail.provider.parametersReference", namedReferenceLabel(detail.parametersRef)],
    ]),
  ];
  if (detail.type === "gcp-machine") return [
    section("instance", "resources.detail.provider.instance", [
      ["resources.detail.provider.statusReady", yesNo(detail.ready, t)],
      ["resources.detail.provider.instanceType", detail.instanceType],
      ["resources.detail.provider.zone", detail.zone],
      ["resources.detail.provider.instanceId", detail.instanceId],
      ["resources.detail.provider.image", detail.image],
    ]),
    section("disks", "resources.detail.provider.additionalDisks", [
      [
        "resources.detail.provider.additionalDisks",
        join(detail.additionalDisks.map((disk) => diskLabel(disk.deviceType, disk.sizeGb))),
      ],
    ]),
  ];
  if (detail.type === "gcp-managed-control-plane") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.statusReady", yesNo(detail.ready, t)],
      ["resources.detail.provider.clusterName", detail.clusterName],
      ["resources.detail.provider.project", detail.project],
      ["resources.detail.provider.location", detail.location],
      ["resources.detail.provider.version", detail.version],
      ["resources.detail.provider.releaseChannel", detail.releaseChannel],
      ["resources.detail.provider.autopilot", yesNo(detail.autopilot, t)],
      ["resources.detail.provider.endpoint", detail.endpoint],
    ]),
    section("network", "resources.detail.provider.network", [
      ["resources.detail.provider.podCidr", detail.podCidr],
      ["resources.detail.provider.serviceCidr", detail.serviceCidr],
      ["resources.detail.provider.ipAliases", yesNo(detail.ipAliases, t)],
      [
        "resources.detail.provider.authorizedNetworks",
        join(detail.authorizedNetworks.map(({ name, cidr }) => join([name, cidr]))),
      ],
    ]),
    section("services", "resources.detail.provider.services", [
      ["resources.detail.provider.loggingService", detail.loggingService],
      ["resources.detail.provider.monitoringService", detail.monitoringService],
    ]),
  ];
  if (detail.type === "gcp-managed-machine-pool") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.statusReady", yesNo(detail.ready, t)],
      ["resources.detail.provider.nodePool", detail.nodePoolName],
      ["resources.detail.provider.machineType", detail.machineType],
      ["resources.detail.provider.disk", disk(detail.diskType, detail.diskSizeGb)],
      ["resources.detail.provider.imageType", detail.imageType],
      ["resources.detail.provider.maxPodsPerNode", number(detail.maxPodsPerNode)],
    ]),
    scalingSection(detail.scaling),
    section("management", "resources.detail.provider.management", [
      ["resources.detail.provider.autoscaling", yesNo(detail.autoscalingEnabled, t)],
      ["resources.detail.provider.autoRepair", yesNo(detail.autoRepair, t)],
      ["resources.detail.provider.autoUpgrade", yesNo(detail.autoUpgrade, t)],
    ]),
    section("configuration", "resources.detail.provider.configuration", [
      ["resources.detail.provider.nodeLocations", join(detail.nodeLocations)],
      ["resources.detail.provider.labels", formatKeyValues(detail.labels)],
      [
        "resources.detail.provider.taints",
        join(detail.taints.map((item) => join([item.key, item.value, item.effect]))),
      ],
    ]),
  ];
  if (detail.type === "karpenter-ec2-node-class") return [
    section("karpenter-instance", "resources.detail.provider.instanceConfiguration", [
      ["resources.detail.provider.statusReady", yesNo(detail.ready, t)],
      ["resources.detail.provider.role", detail.role],
      ["resources.detail.provider.instanceProfile", detail.instanceProfile],
      ["resources.detail.provider.amiFamily", detail.amiFamily],
      [
        "resources.detail.provider.amiSelector",
        join(detail.amiSelectorTerms.map(formatKarpenterSelectorTerm)),
      ],
    ]),
    section("karpenter-block-devices", "resources.detail.provider.blockDevices", [
      [
        "resources.detail.provider.blockDevices",
        join(detail.blockDevices.map((device) => formatKarpenterBlockDevice(device, t))),
      ],
    ]),
    section("karpenter-network", "resources.detail.provider.network", [
      [
        "resources.detail.provider.subnetSelector",
        join(detail.subnetSelectorTerms.map(formatKarpenterSelectorTerm)),
      ],
      [
        "resources.detail.provider.securityGroupSelector",
        join(detail.securityGroupSelectorTerms.map(formatKarpenterSelectorTerm)),
      ],
      [
        "resources.detail.provider.resolvedSubnets",
        join(detail.resolvedSubnets.map((item) => join([item.id, item.name, item.zone]))),
      ],
      [
        "resources.detail.provider.resolvedSecurityGroups",
        join(detail.resolvedSecurityGroups.map((item) => join([item.id, item.name]))),
      ],
    ]),
    section("karpenter-metadata", "resources.detail.provider.metadataOptions", [
      ["resources.detail.provider.httpTokens", detail.metadataOptions?.httpTokens ?? null],
      [
        "resources.detail.provider.hopLimit",
        number(detail.metadataOptions?.httpPutResponseHopLimit ?? null),
      ],
      ["resources.detail.provider.httpEndpoint", detail.metadataOptions?.httpEndpoint ?? null],
    ]),
    section("karpenter-amis", "resources.detail.provider.resolvedAmis", [
      [
        "resources.detail.provider.resolvedAmis",
        join(detail.resolvedAmis.map((ami) => join([
          ami.id,
          ami.name,
          formatRequirements(ami.requirements),
        ]))),
      ],
      ["resources.detail.provider.tags", formatKeyValues(detail.tags)],
    ]),
  ];
  if (detail.type === "karpenter-node-claim") return [
    section("karpenter-claim", "resources.detail.provider.instance", [
      ["resources.detail.provider.lifecycleState", t(karpenterNodeClaimStateKey(detail.state))],
      ["resources.detail.provider.instanceType", detail.instanceType],
      ["resources.detail.provider.capacityType", detail.capacityType],
      ["resources.detail.provider.nodeName", detail.nodeName],
      ["resources.detail.provider.zone", detail.zone],
      ["resources.detail.provider.architecture", detail.architecture],
      ["resources.detail.provider.nodePool", detail.nodePool],
      ["resources.detail.provider.nodeClass", namedReferenceLabel(detail.nodeClassRef)],
      ["resources.detail.provider.image", detail.imageId],
      ["resources.detail.provider.expireAfter", detail.expireAfter],
    ]),
    section("karpenter-capacity", "resources.detail.provider.capacity", [
      ["resources.detail.provider.cpu", detail.capacity.cpu],
      ["resources.detail.provider.memory", detail.capacity.memory],
      ["resources.detail.provider.pods", detail.capacity.pods],
      ["resources.detail.provider.ephemeralStorage", detail.capacity.ephemeralStorage],
    ]),
    section("karpenter-requirements", "resources.detail.provider.requirements", [
      ["resources.detail.provider.requirements", formatRequirements(detail.requirements)],
    ]),
  ];
  if (detail.type === "karpenter-node-pool") return [
    section("karpenter-pool", "resources.detail.provider.nodeClass", [
      ["resources.detail.provider.statusReady", yesNo(detail.ready, t)],
      ["resources.detail.provider.nodeClass", namedReferenceLabel(detail.nodeClassRef)],
      ["resources.detail.provider.weight", number(detail.weight)],
    ]),
    section("karpenter-limits", "resources.detail.provider.limits", [
      ["resources.detail.provider.cpu", join([detail.currentCpu, detail.limitCpu])],
      ["resources.detail.provider.memory", join([detail.currentMemory, detail.limitMemory])],
    ]),
    section("karpenter-disruption", "resources.detail.provider.disruption", [
      ["resources.detail.provider.consolidationPolicy", detail.consolidationPolicy],
      ["resources.detail.provider.consolidateAfter", detail.consolidateAfter],
      ["resources.detail.provider.expireAfter", detail.expireAfter],
      [
        "resources.detail.provider.disruptionBudgets",
        join(detail.disruptionBudgets.map((budget) => join([
          budget.nodes,
          budget.schedule,
          budget.duration,
        ]))),
      ],
    ]),
    section("karpenter-template", "resources.detail.provider.configuration", [
      ["resources.detail.provider.templateLabels", formatKeyValues(detail.templateLabels)],
      ["resources.detail.provider.taints", formatTaints(detail.templateTaints)],
      ["resources.detail.provider.startupTaints", formatTaints(detail.startupTaints)],
      ["resources.detail.provider.requirements", formatRequirements(detail.requirements)],
    ]),
  ];
  if (detail.type === "keda-scaled-object") return [
    section("keda-scaling", "resources.detail.provider.scaling", [
      ["resources.detail.provider.scalerState", t(kedaScaledObjectStateKey(detail.state))],
      ["resources.detail.provider.target", namedReferenceLabel(detail.targetRef)],
      ["resources.detail.provider.minimum", number(detail.scaling.minimum)],
      ["resources.detail.provider.maximum", number(detail.scaling.maximum)],
      ["resources.detail.provider.idleReplicas", number(detail.idleReplicas)],
      ["resources.detail.provider.pollingInterval", seconds(detail.pollingIntervalSeconds)],
      ["resources.detail.provider.cooldownPeriod", seconds(detail.cooldownPeriodSeconds)],
      ["resources.detail.provider.generatedHpa", detail.hpaName],
      ["resources.detail.provider.lastActive", detail.lastActiveTime],
    ]),
    section("keda-fallback", "resources.detail.provider.fallback", [
      ["resources.detail.provider.failureThreshold", number(detail.fallbackFailureThreshold)],
      ["resources.detail.provider.fallbackReplicas", number(detail.fallbackReplicas)],
    ]),
    section("keda-advanced", "resources.detail.provider.advanced", [
      [
        "resources.detail.provider.restoreOriginalReplicas",
        yesNo(detail.restoreOriginalReplicas, t),
      ],
      [
        "resources.detail.provider.scaleUpStabilization",
        seconds(detail.scaleUpStabilizationSeconds),
      ],
      [
        "resources.detail.provider.scaleDownStabilization",
        seconds(detail.scaleDownStabilizationSeconds),
      ],
      [
        "resources.detail.provider.scalingPolicies",
        join(detail.scalingPolicies.map(formatKedaScalingPolicy)),
      ],
    ]),
  ];
  if (detail.type === "keda-scaled-job") return [
    section("keda-job", "resources.detail.provider.scaling", [
      ["resources.detail.provider.scalerState", t(kedaScaledJobStateKey(detail.state))],
      ["resources.detail.provider.jobTarget", detail.jobTargetName],
      ["resources.detail.provider.strategy", detail.strategy],
      ["resources.detail.provider.pollingInterval", seconds(detail.pollingIntervalSeconds)],
      ["resources.detail.provider.successHistory", number(detail.successfulHistoryLimit)],
      ["resources.detail.provider.failedHistory", number(detail.failedHistoryLimit)],
      ["resources.detail.provider.minimum", number(detail.minimumReplicas)],
      ["resources.detail.provider.maximum", number(detail.maximumReplicas)],
    ]),
  ];
  if (detail.type === "sbom-report") return [
    section("sbom-overview", "resources.detail.provider.reportOverview", [
      ["resources.detail.provider.container", detail.containerName],
      ["resources.detail.provider.image", detail.image],
      ["resources.detail.provider.format", join([detail.bomFormat, detail.specVersion])],
      ["resources.detail.provider.components", number(detail.componentCount)],
      ["resources.detail.provider.dependencies", number(detail.dependencyCount)],
      ["resources.detail.provider.scanner", join([detail.scannerName, detail.scannerVersion])],
      ["resources.detail.provider.scannedAt", detail.scannedAt],
    ]),
  ];
  if (detail.type === "vulnerability-report") return [
    section("vulnerability-overview", "resources.detail.provider.reportOverview", [
      ["resources.detail.provider.container", detail.containerName],
      ["resources.detail.provider.image", detail.image],
      ["resources.detail.provider.os", join([detail.osFamily, detail.osName])],
      [
        "resources.detail.provider.endOfServiceLife",
        yesNo(detail.osEndOfServiceLife, t),
      ],
      ["resources.detail.provider.scanner", join([detail.scannerName, detail.scannerVersion])],
      ["resources.detail.provider.scannedAt", detail.scannedAt],
    ]),
  ];
  if (detail.type === "prometheus-rule") return [
    section("prometheus-summary", "resources.detail.provider.summary", [
      ["resources.detail.provider.ruleGroups", number(detail.groupCount)],
      ["resources.detail.provider.totalRules", number(detail.totalRules)],
      ["resources.detail.provider.displayedRules", number(detail.projectedRules)],
      ["resources.detail.provider.alertRules", number(detail.totalAlerts)],
      ["resources.detail.provider.recordingRules", number(detail.totalRecordings)],
      ["resources.detail.provider.truncated", yesNo(detail.truncated, t)],
    ]),
  ];
  if (
    detail.type === "grpc-route" ||
    detail.type === "http-route" ||
    detail.type === "tcp-route" ||
    detail.type === "tls-route"
  ) return [
    section("route-status", "resources.detail.provider.status", [
      ["resources.detail.provider.hostnames", join(detail.hostnames)],
      [
        "resources.detail.provider.parentGateways",
        join(detail.parentRefs.map(namedReferenceLabel)),
      ],
      ["resources.detail.provider.ruleCount", number(detail.rules.length)],
    ]),
    section("parent-status", "resources.detail.provider.parentStatus", [
      [
        "resources.detail.provider.parentStatus",
        join(detail.parentStatuses.map((parent) => formatGatewayParentStatus(parent, t))),
      ],
    ]),
  ];
  if (detail.type === "job") return [
    section("job-status", "resources.detail.provider.status", [
      ["resources.detail.provider.jobState", t(jobStateKey(detail.state))],
      ["resources.detail.provider.succeeded", number(detail.succeeded)],
      ["resources.detail.provider.failed", number(detail.failed)],
      ["resources.detail.provider.active", number(detail.active)],
      ["resources.detail.provider.completions", number(detail.completions)],
      ["resources.detail.provider.startTime", detail.startTime],
      ["resources.detail.provider.completionTime", detail.completionTime],
      ["resources.detail.provider.terminalReason", detail.terminalReason],
      ["resources.detail.provider.terminalMessage", detail.terminalMessage],
    ]),
    section("job-configuration", "resources.detail.provider.configuration", [
      ["resources.detail.provider.parallelism", number(detail.parallelism)],
      ["resources.detail.provider.completions", number(detail.completions)],
      ["resources.detail.provider.backoffLimit", number(detail.backoffLimit)],
      ["resources.detail.provider.activeDeadline", seconds(detail.activeDeadlineSeconds)],
      ["resources.detail.provider.ttlAfterFinish", seconds(detail.ttlSecondsAfterFinished)],
      ["resources.detail.provider.suspended", yesNo(detail.suspended, t)],
    ]),
  ];
  return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.poolName", detail.poolName],
      ["resources.detail.provider.vmSize", detail.vmSize],
      ["resources.detail.provider.mode", detail.mode],
      ["resources.detail.provider.osType", detail.osType],
      ["resources.detail.provider.osDisk", disk(detail.osDiskType, detail.osDiskSizeGb)],
      ["resources.detail.provider.priority", detail.priority],
      ["resources.detail.provider.maxPods", number(detail.maxPods)],
    ]),
    scalingSection(detail.scaling),
    section("configuration", "resources.detail.provider.configuration", [
      ["resources.detail.provider.scaleDownMode", detail.scaleDownMode],
      ["resources.detail.provider.failureDomains", join(detail.availabilityZones)],
      ["resources.detail.provider.labels", join(detail.labels.map(({ key, value }) => `${key}=${value}`))],
      ["resources.detail.provider.taints", join(detail.taints.map((item) => join([item.key, item.value, item.effect])!).filter(Boolean))],
    ]),
  ];
}

function replicaSection(
  id: string,
  label: MessageKey,
  value: { desired: number | null; ready: number | null; available: number | null; upToDate: number | null },
): ProviderSection {
  return section(id, label, [
    ["resources.detail.provider.desired", number(value.desired)],
    ["resources.detail.provider.ready", number(value.ready)],
    ["resources.detail.provider.available", number(value.available)],
    ["resources.detail.provider.upToDate", number(value.upToDate)],
  ]);
}

function referencesSection(
  first: { apiVersion: string | null; kind: string; namespace: string | null; name: string } | null,
  second: { apiVersion: string | null; kind: string; namespace: string | null; name: string } | null,
): ProviderSection {
  return section("references", "resources.detail.provider.references", [
    ["resources.detail.provider.bootstrap", referenceLabel(first)],
    ["resources.detail.provider.infrastructure", referenceLabel(second)],
  ]);
}

function referenceLabel(
  value: { apiVersion: string | null; kind: string; namespace: string | null; name: string } | null,
): string | null {
  return value === null ? null : join([value.kind, value.namespace, value.name]);
}

function namedReferenceLabel(
  value: { apiVersion: string | null; kind: string | null; namespace: string | null; name: string } | null,
): string | null {
  return value === null ? null : join([value.kind, value.namespace, value.name]);
}

function scalingSection(
  value: { minimum: number | null; maximum: number | null; current: number | null },
  maxUnavailable: number | null = null,
): ProviderSection {
  return section("scaling", "resources.detail.provider.scaling", [
    ["resources.detail.provider.minimum", number(value.minimum)],
    ["resources.detail.provider.maximum", number(value.maximum)],
    ["resources.detail.provider.current", number(value.current)],
    ["resources.detail.provider.maxUnavailable", number(maxUnavailable)],
  ]);
}

function section(
  id: string,
  label: MessageKey,
  rows: Array<[MessageKey, string | null]>,
): ProviderSection {
  return { id, label, rows };
}

function formatAwsSubnet(value: {
  id: string | null;
  availabilityZone: string | null;
  public: boolean | null;
  cidrBlock: string | null;
}): string {
  return join([
    value.id,
    value.availabilityZone,
    value.public === null ? null : value.public ? "public" : "private",
    value.cidrBlock,
  ]) ?? "";
}

function yesNo(value: boolean | null, t: TranslationFunction): string | null {
  return value === null
    ? null
    : t(value ? "resources.detail.value.yes" : "resources.detail.value.no");
}

function disk(type: string | null, size: number | null): string | null {
  return join([type, numberWithUnit(size, "GB")]);
}

function numberWithUnit(value: number | null, unit: string): string | null {
  return value === null ? null : `${value} ${unit}`;
}

function number(value: number | null): string | null {
  return value === null ? null : String(value);
}

function seconds(value: number | null): string | null {
  return value === null ? null : `${value}s`;
}

function formatSecretMapping(value: {
  secretKey: string | null;
  remoteKey: string | null;
  remoteProperty: string | null;
  remoteVersion: string | null;
}): string {
  return join([
    value.secretKey,
    value.remoteKey,
    value.remoteProperty,
    value.remoteVersion,
  ]) ?? "";
}

function formatKeyValues(values: Array<{ key: string; value: string }>): string | null {
  return join(values.map(({ key, value }) => `${key}=${value}`));
}

function diskLabel(type: string | null, size: number | null): string | null {
  return join([type, numberWithUnit(size, "GB")]);
}

function formatKarpenterSelectorTerm(value: {
  id: string | null;
  name: string | null;
  alias: string | null;
  owner: string | null;
  tags: Array<{ key: string; value: string }>;
}): string | null {
  return join([
    value.alias,
    value.id,
    value.name,
    value.owner,
    formatKeyValues(value.tags),
  ]);
}

function formatKarpenterBlockDevice(
  value: Extract<
    ProviderResourceDetail,
    { type: "karpenter-ec2-node-class" }
  >["blockDevices"][number],
  t: TranslationFunction,
): string | null {
  return join([
    value.deviceName,
    value.volumeType,
    value.volumeSize,
    number(value.iops),
    number(value.throughput),
    yesNo(value.encrypted, t),
    yesNo(value.deleteOnTermination, t),
  ]);
}

function formatRequirements(
  values: Array<{
    key: string;
    operator: string | null;
    values: string[];
    minValues: number | null;
  }>,
): string | null {
  return join(values.map((value) => join([
    value.key,
    value.operator,
    join(value.values),
    number(value.minValues),
  ])));
}

function formatTaints(
  values: Array<{ key: string; value: string | null; effect: string | null }>,
): string | null {
  return join(values.map((value) => join([value.key, value.value, value.effect])));
}

function formatKedaScalingPolicy(
  value: Extract<
    ProviderResourceDetail,
    { type: "keda-scaled-object" }
  >["scalingPolicies"][number],
): string | null {
  return join([
    value.direction,
    value.type,
    number(value.value),
    seconds(value.periodSeconds),
  ]);
}

function formatGatewayRouteMatch(
  match: GatewayRouteDetail["rules"][number]["matches"][number],
  t: TranslationFunction,
): string {
  const grpcTarget = join([
    match.grpcService,
    match.grpcMethod,
  ]);
  return join([
    match.method,
    join([match.pathType, match.pathValue]),
    join([match.grpcType, grpcTarget]),
    match.headers.length > 0
      ? `${t("resources.detail.provider.headers")}: ${formatKeyValues(match.headers)}`
      : null,
    match.queryParams.length > 0
      ? `${t("resources.detail.provider.queryParams")}: ${formatKeyValues(match.queryParams)}`
      : null,
  ]) ?? t("resources.detail.provider.matchAll");
}

function formatGatewayRouteBackend(
  backend: GatewayRouteDetail["rules"][number]["backends"][number],
  t: TranslationFunction,
): string {
  return join([
    namedReferenceLabel(backend.reference),
    backend.port === null
      ? null
      : t("resources.detail.provider.portValue", { count: backend.port }),
    backend.weight === null
      ? null
      : t("resources.detail.provider.weightValue", { count: backend.weight }),
  ]) ?? backend.reference.name;
}

function formatGatewayParentStatus(
  parent: GatewayRouteDetail["parentStatuses"][number],
  t: TranslationFunction,
): string | null {
  return join([
    namedReferenceLabel(parent.reference),
    parent.sectionName,
    parent.accepted === null
      ? null
      : t(parent.accepted
        ? "resources.detail.provider.parentAccepted"
        : "resources.detail.provider.parentNotAccepted"),
    parent.resolvedRefs === null
      ? null
      : t(parent.resolvedRefs
        ? "resources.detail.provider.refsResolved"
        : "resources.detail.provider.refsUnresolved"),
  ]);
}

function jobStateKey(
  state: Extract<ProviderResourceDetail, { type: "job" }>["state"],
): MessageKey {
  switch (state) {
    case "completed":
      return "resources.detail.provider.jobCompleted";
    case "failed":
      return "resources.detail.provider.jobFailed";
    case "suspended":
      return "resources.detail.provider.jobSuspended";
    case "running":
      return "resources.detail.provider.jobRunning";
    case "pending":
      return "resources.detail.provider.jobPending";
  }
}

function karpenterNodeClaimStateKey(
  state: Extract<ProviderResourceDetail, { type: "karpenter-node-claim" }>["state"],
): MessageKey {
  switch (state) {
    case "ready":
      return "resources.detail.provider.stateReady";
    case "registered":
      return "resources.detail.provider.stateRegistered";
    case "launched":
      return "resources.detail.provider.stateLaunched";
    case "initialized":
      return "resources.detail.provider.stateInitialized";
    case "not-ready":
      return "resources.detail.provider.stateNotReady";
    case "pending":
      return "resources.detail.provider.jobPending";
    case "unknown":
      return "resources.detail.provider.stateUnknown";
  }
}

function kedaScaledObjectStateKey(
  state: Extract<ProviderResourceDetail, { type: "keda-scaled-object" }>["state"],
): MessageKey {
  switch (state) {
    case "paused":
      return "resources.detail.provider.statePaused";
    case "fallback":
      return "resources.detail.provider.stateFallback";
    case "not-ready":
      return "resources.detail.provider.stateNotReady";
    case "active":
      return "resources.detail.provider.stateActive";
    case "idle":
      return "resources.detail.provider.stateIdle";
    case "ready":
      return "resources.detail.provider.stateReady";
    case "unknown":
      return "resources.detail.provider.stateUnknown";
  }
}

function kedaScaledJobStateKey(
  state: Extract<ProviderResourceDetail, { type: "keda-scaled-job" }>["state"],
): MessageKey {
  switch (state) {
    case "not-ready":
      return "resources.detail.provider.stateNotReady";
    case "active":
      return "resources.detail.provider.stateActive";
    case "idle":
      return "resources.detail.provider.stateIdle";
    case "ready":
      return "resources.detail.provider.stateReady";
    case "unknown":
      return "resources.detail.provider.stateUnknown";
  }
}

function toggleSet(current: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function workflowNodeTone(phase: string): StatusTone {
  if (phase === "Succeeded") return "healthy";
  if (phase === "Failed" || phase === "Error") return "critical";
  if (phase === "Running" || phase === "Pending" || phase === "Suspended") return "warning";
  return "unknown";
}

function join(values: Array<string | null>): string | null {
  const present = values.filter((value): value is string => value !== null && value.length > 0);
  return present.length > 0 ? present.join(" · ") : null;
}
