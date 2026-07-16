import { ExternalLink, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import type { ProviderResourceDetail } from "../../features/resources/providerResourceContract";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Collapse, CollapseChevron } from "../../shared/ui/primitives/collapse";
import { Input } from "../../shared/ui/primitives/input";

type SbomReportDetail = Extract<ProviderResourceDetail, { type: "sbom-report" }>;
type VulnerabilityReportDetail = Extract<
  ProviderResourceDetail,
  { type: "vulnerability-report" }
>;
type Vulnerability = VulnerabilityReportDetail["vulnerabilities"][number];
type VulnerabilitySeverity = Vulnerability["severity"];
type VulnerabilitySortColumn =
  | "vulnerabilityId"
  | "severity"
  | "score"
  | "package"
  | "installedVersion"
  | "fixedVersion";
type SortDirection = "asc" | "desc";

const SBOM_INITIAL_VISIBLE = 100;
const VULNERABILITY_INITIAL_VISIBLE = 50;
const VULNERABILITY_SEVERITY_ORDER: Record<VulnerabilitySeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  UNKNOWN: 4,
};
const VULNERABILITY_COLUMNS: ReadonlyArray<{
  key: VulnerabilitySortColumn;
  label:
    | "resources.detail.provider.cve"
    | "resources.detail.provider.severity"
    | "resources.detail.provider.score"
    | "resources.detail.provider.package"
    | "resources.detail.provider.installedVersion"
    | "resources.detail.provider.fixedVersion";
}> = [
  { key: "vulnerabilityId", label: "resources.detail.provider.cve" },
  { key: "severity", label: "resources.detail.provider.severity" },
  { key: "score", label: "resources.detail.provider.score" },
  { key: "package", label: "resources.detail.provider.package" },
  { key: "installedVersion", label: "resources.detail.provider.installedVersion" },
  { key: "fixedVersion", label: "resources.detail.provider.fixedVersion" },
];

export function SbomComponentsPanel({ detail }: { detail: SbomReportDetail }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const normalized = query.trim().toLocaleLowerCase();
  const filtered = useMemo(
    () => detail.components.filter((component) => (
      normalized.length === 0 ||
      [
        component.name,
        component.version,
        component.type,
        component.packageUrl,
        component.license,
      ]
        .filter((value): value is string => value !== null)
        .some((value) => value.toLocaleLowerCase().includes(normalized))
    )),
    [detail.components, normalized],
  );
  const visible = showAll ? filtered : filtered.slice(0, SBOM_INITIAL_VISIBLE);
  const contentId = "provider-sbom-components-content";

  if (detail.components.length === 0) return null;
  return (
    <section aria-labelledby="provider-sbom-components" className="grid gap-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h4 className="text-sm font-medium" id="provider-sbom-components">
          {t("resources.detail.provider.components")}
        </h4>
        <Button
          aria-controls={contentId}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <CollapseChevron className="size-4" open={expanded} />
          {t("resources.detail.provider.componentResultCount", {
            count: detail.components.length,
            total: detail.observedComponentCount,
          })}
        </Button>
      </div>
      <Collapse mountLazily open={expanded}>
        <div className="grid gap-3" id={contentId}>
          <Input
            aria-label={t("resources.detail.provider.componentSearch")}
            onChange={(event) => {
              setQuery(event.target.value);
              setShowAll(false);
            }}
            placeholder={t("resources.detail.provider.componentSearchPlaceholder")}
            type="search"
            value={query}
          />
          {normalized ? (
            <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                {t("resources.detail.provider.componentResultCount", {
                  count: filtered.length,
                  total: detail.components.length,
                })}
              </span>
              <Button
                onClick={() => {
                  setQuery("");
                  setShowAll(false);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("resources.detail.provider.clearFilters")}
              </Button>
            </div>
          ) : null}
          {detail.truncated ? (
            <p className="rounded-lg border border-status-warning/30 bg-status-warning/5 p-3 text-xs text-muted-foreground">
              {t("resources.detail.provider.componentProjectionTruncated", {
                count: detail.projectedComponentCount,
                total: detail.observedComponentCount,
              })}
            </p>
          ) : null}
          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              {t("resources.detail.provider.noComponentResults")}
            </p>
          ) : (
            <div className="min-w-0 overflow-x-auto rounded-lg border">
              <table className="w-full min-w-180 text-left text-xs">
                <thead className="border-b bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">
                      {t("resources.detail.provider.name")}
                    </th>
                    <th className="px-3 py-2 font-medium">
                      {t("resources.detail.provider.version")}
                    </th>
                    <th className="px-3 py-2 font-medium">
                      {t("resources.detail.provider.type")}
                    </th>
                    <th className="px-3 py-2 font-medium">
                      {t("resources.detail.provider.license")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((component, index) => (
                    <tr
                      className="border-b last:border-b-0 hover:bg-muted/30"
                      key={`${component.name}-${component.version ?? "none"}-${index}`}
                    >
                      <td className="max-w-80 px-3 py-2 align-top">
                        <span className="block font-medium [overflow-wrap:anywhere]">
                          {component.name}
                        </span>
                        {component.packageUrl ? (
                          <span
                            className="block font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]"
                            title={component.packageUrl}
                          >
                            {component.packageUrl}
                            {component.packageUrlQualifiersRedacted
                              ? ` · ${t("resources.detail.provider.qualifiersRedacted")}`
                              : ""}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-muted-foreground">
                        {component.version ?? t("resources.detail.provider.none")}
                      </td>
                      <td className="px-3 py-2 align-top text-muted-foreground">
                        {component.type ?? t("resources.detail.provider.none")}
                      </td>
                      <td className="px-3 py-2 align-top text-muted-foreground">
                        {component.license ?? t("resources.detail.provider.none")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!showAll && filtered.length > SBOM_INITIAL_VISIBLE ? (
            <Button
              className="w-fit"
              onClick={() => setShowAll(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("resources.detail.provider.showAllComponents", {
                count: filtered.length,
              })}
            </Button>
          ) : null}
        </div>
      </Collapse>
    </section>
  );
}

export function VulnerabilityReportPanel({
  detail,
  onOpenExternalUrl,
}: {
  detail: VulnerabilityReportDetail;
  onOpenExternalUrl: (url: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const [query, setQuery] = useState("");
  const [severityFilters, setSeverityFilters] = useState<ReadonlySet<VulnerabilitySeverity>>(
    () => new Set(),
  );
  const [fixableOnly, setFixableOnly] = useState(false);
  const [sortColumn, setSortColumn] = useState<VulnerabilitySortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [showAll, setShowAll] = useState(false);
  const [externalError, setExternalError] = useState(false);
  const normalized = query.trim().toLocaleLowerCase();
  const total = Object.values(detail.severity).reduce((sum, count) => sum + count, 0);
  const processed = useMemo(() => {
    let result = detail.vulnerabilities.filter((vulnerability) => {
      if (severityFilters.size > 0 && !severityFilters.has(vulnerability.severity)) {
        return false;
      }
      if (fixableOnly && vulnerability.fixedVersion === null) return false;
      if (!normalized) return true;
      return [vulnerability.vulnerabilityId, vulnerability.package]
        .filter((value): value is string => value !== null)
        .some((value) => value.toLocaleLowerCase().includes(normalized));
    });
    if (sortColumn !== null) {
      result = [...result].sort((left, right) => (
        compareVulnerabilities(left, right, sortColumn) *
        (sortDirection === "asc" ? 1 : -1)
      ));
    }
    return result;
  }, [
    detail.vulnerabilities,
    fixableOnly,
    normalized,
    severityFilters,
    sortColumn,
    sortDirection,
  ]);
  const visible = showAll
    ? processed
    : processed.slice(0, VULNERABILITY_INITIAL_VISIBLE);
  const hasActiveFilters = normalized.length > 0 || severityFilters.size > 0 || fixableOnly;
  const contentId = "provider-vulnerabilities-content";

  function toggleSeverity(severity: VulnerabilitySeverity) {
    setSeverityFilters((current) => {
      const next = new Set(current);
      if (next.has(severity)) next.delete(severity);
      else next.add(severity);
      return next;
    });
    setShowAll(false);
  }

  function changeSort(column: VulnerabilitySortColumn) {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection("desc");
      return;
    }
    if (sortDirection === "desc") {
      setSortDirection("asc");
      return;
    }
    setSortColumn(null);
    setSortDirection("desc");
  }

  function clearFilters() {
    setQuery("");
    setSeverityFilters(new Set());
    setFixableOnly(false);
    setShowAll(false);
  }

  return (
    <div className="grid gap-4">
      {detail.severity.critical > 0 || detail.severity.high > 0 ? (
        <section
          className={cn(
            "grid gap-1 rounded-lg border p-3",
            detail.severity.critical > 0
              ? "border-destructive/30 bg-destructive/5"
              : "border-status-warning/30 bg-status-warning/5",
          )}
          role="status"
        >
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <ShieldAlert
              aria-hidden="true"
              className={cn(
                "size-4",
                detail.severity.critical > 0 ? "text-destructive" : "text-status-warning",
              )}
            />
            {detail.severity.critical > 0
              ? t("resources.detail.provider.criticalVulnerabilityAlert", {
                count: detail.severity.critical,
              })
              : t("resources.detail.provider.highVulnerabilityAlert", {
                count: detail.severity.high,
              })}
          </h4>
          <p className="text-xs text-muted-foreground">
            {t("resources.detail.provider.vulnerabilityAlertDescription")}
          </p>
        </section>
      ) : null}
      <section aria-labelledby="provider-vulnerability-severity" className="grid gap-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h4 className="text-sm font-medium" id="provider-vulnerability-severity">
            {t("resources.detail.provider.severitySummary")}
          </h4>
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("resources.detail.provider.totalCount", { count: total })}
          </span>
        </div>
        {total > 0 ? (
          <div
            aria-label={t("resources.detail.provider.severityDistribution")}
            className="flex h-3 overflow-hidden rounded-full bg-muted"
            role="img"
          >
            {severityEntries(detail).map(({ severity, count }) => (
              count > 0 ? (
                <span
                  className={cn("h-full min-w-px", severityFillClass(severity))}
                  key={severity}
                  style={{ flexGrow: count }}
                  title={`${severity}: ${count}`}
                />
              ) : null
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {severityEntries(detail).map(({ severity, count }) => (
            <button
              aria-label={`${t(severityMessageKey(severity))} ${count}`}
              aria-pressed={severityFilters.has(severity)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors motion-reduce:transition-none",
                severityBadgeClass(severity),
                count === 0 && "cursor-default opacity-45",
                severityFilters.has(severity) && "ring-2 ring-ring/40",
              )}
              disabled={count === 0}
              key={severity}
              onClick={() => toggleSeverity(severity)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={cn("size-2 rounded-sm", severityFillClass(severity))}
              />
              <span className="font-medium tabular-nums">{count}</span>
              <span>{t(severityMessageKey(severity))}</span>
            </button>
          ))}
        </div>
      </section>
      {detail.vulnerabilities.length > 0 ? (
        <section aria-labelledby="provider-vulnerabilities" className="grid gap-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h4 className="text-sm font-medium" id="provider-vulnerabilities">
              {t("resources.detail.provider.vulnerabilities")}
            </h4>
            <Button
              aria-controls={contentId}
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <CollapseChevron className="size-4" open={expanded} />
              {t("resources.detail.provider.vulnerabilityResultCount", {
                count: detail.vulnerabilities.length,
                total: detail.observedVulnerabilityCount,
              })}
            </Button>
          </div>
          <Collapse mountLazily open={expanded}>
            <div className="grid gap-3" id={contentId}>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <Input
                  aria-label={t("resources.detail.provider.vulnerabilitySearch")}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setShowAll(false);
                  }}
                  placeholder={t("resources.detail.provider.vulnerabilitySearchPlaceholder")}
                  type="search"
                  value={query}
                />
                <Button
                  aria-pressed={fixableOnly}
                  onClick={() => {
                    setFixableOnly((value) => !value);
                    setShowAll(false);
                  }}
                  size="sm"
                  type="button"
                  variant={fixableOnly ? "secondary" : "outline"}
                >
                  {t("resources.detail.provider.fixableOnly")}
                </Button>
              </div>
              {hasActiveFilters ? (
                <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {t("resources.detail.provider.vulnerabilityResultCount", {
                      count: processed.length,
                      total: detail.vulnerabilities.length,
                    })}
                  </span>
                  <Button
                    onClick={clearFilters}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {t("resources.detail.provider.clearFilters")}
                  </Button>
                </div>
              ) : null}
              {detail.truncated ? (
                <p className="rounded-lg border border-status-warning/30 bg-status-warning/5 p-3 text-xs text-muted-foreground">
                  {t("resources.detail.provider.vulnerabilityProjectionTruncated", {
                    count: detail.projectedVulnerabilityCount,
                    total: detail.observedVulnerabilityCount,
                  })}
                </p>
              ) : null}
              {externalError ? (
                <p className="text-xs text-destructive" role="alert">
                  {t("resources.detail.provider.externalLinkFailure")}
                </p>
              ) : null}
              {visible.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  {t("resources.detail.provider.noVulnerabilityResults")}
                </p>
              ) : (
                <div className="min-w-0 overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-220 text-left text-xs">
                    <thead className="border-b bg-muted/40 text-muted-foreground">
                      <tr>
                        {VULNERABILITY_COLUMNS.map((column) => {
                          const active = sortColumn === column.key;
                          return (
                            <th
                              aria-sort={active
                                ? sortDirection === "asc"
                                  ? "ascending"
                                  : "descending"
                                : "none"}
                              className="px-3 py-2 font-medium"
                              key={column.key}
                            >
                              <button
                                className="inline-flex items-center gap-1 hover:text-foreground"
                                onClick={() => changeSort(column.key)}
                                type="button"
                              >
                                {t(column.label)}
                                <span aria-hidden="true" className="text-[10px]">
                                  {active ? sortDirection === "asc" ? "↑" : "↓" : "↕"}
                                </span>
                              </button>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((vulnerability, index) => (
                        <tr
                          className="border-b last:border-b-0 hover:bg-muted/30"
                          key={`${vulnerability.vulnerabilityId}-${index}`}
                        >
                          <td className="max-w-64 px-3 py-2 align-top">
                            {vulnerability.primaryLink ? (
                              <button
                                aria-label={t("resources.detail.provider.openVulnerabilityLink", {
                                  id: vulnerability.vulnerabilityId,
                                })}
                                className="inline-flex max-w-full items-center gap-1 font-medium text-primary hover:underline"
                                onClick={() => {
                                  setExternalError(false);
                                  void onOpenExternalUrl(vulnerability.primaryLink as string)
                                    .catch(() => setExternalError(true));
                                }}
                                type="button"
                              >
                                <span className="truncate">
                                  {vulnerability.vulnerabilityId}
                                </span>
                                <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
                              </button>
                            ) : (
                              <span className="font-medium">
                                {vulnerability.vulnerabilityId}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Badge
                              className={severityBadgeClass(vulnerability.severity)}
                              variant="outline"
                            >
                              {t(severityMessageKey(vulnerability.severity))}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 align-top tabular-nums text-muted-foreground">
                            {vulnerability.score ?? t("resources.detail.provider.none")}
                          </td>
                          <td className="max-w-56 px-3 py-2 align-top text-muted-foreground [overflow-wrap:anywhere]">
                            {vulnerability.package ?? t("resources.detail.provider.none")}
                          </td>
                          <td className="max-w-48 px-3 py-2 align-top font-mono text-muted-foreground [overflow-wrap:anywhere]">
                            {vulnerability.installedVersion ?? t("resources.detail.provider.none")}
                          </td>
                          <td className="max-w-48 px-3 py-2 align-top font-mono [overflow-wrap:anywhere]">
                            <span className={vulnerability.fixedVersion ? "text-status-healthy" : "text-muted-foreground"}>
                              {vulnerability.fixedVersion ?? t("resources.detail.provider.none")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!showAll && processed.length > VULNERABILITY_INITIAL_VISIBLE ? (
                <Button
                  className="w-fit"
                  onClick={() => setShowAll(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("resources.detail.provider.showAllVulnerabilities", {
                    count: processed.length,
                  })}
                </Button>
              ) : null}
            </div>
          </Collapse>
        </section>
      ) : null}
    </div>
  );
}

function severityEntries(detail: VulnerabilityReportDetail) {
  return [
    { severity: "CRITICAL" as const, count: detail.severity.critical },
    { severity: "HIGH" as const, count: detail.severity.high },
    { severity: "MEDIUM" as const, count: detail.severity.medium },
    { severity: "LOW" as const, count: detail.severity.low },
    { severity: "UNKNOWN" as const, count: detail.severity.unknown },
  ];
}

function severityMessageKey(severity: VulnerabilitySeverity) {
  switch (severity) {
    case "CRITICAL":
      return "resources.detail.provider.severityCritical" as const;
    case "HIGH":
      return "resources.detail.provider.severityHigh" as const;
    case "MEDIUM":
      return "resources.detail.provider.severityMedium" as const;
    case "LOW":
      return "resources.detail.provider.severityLow" as const;
    case "UNKNOWN":
      return "resources.detail.provider.severityUnknown" as const;
  }
}

function severityFillClass(severity: VulnerabilitySeverity): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-destructive";
    case "HIGH":
      return "bg-status-warning";
    case "MEDIUM":
      return "bg-status-warning/65";
    case "LOW":
      return "bg-status-healthy";
    case "UNKNOWN":
      return "bg-status-unknown";
  }
}

function severityBadgeClass(severity: VulnerabilitySeverity): string {
  switch (severity) {
    case "CRITICAL":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "HIGH":
      return "border-status-warning/40 bg-status-warning/15 text-status-warning";
    case "MEDIUM":
      return "border-status-warning/25 bg-status-warning/10 text-warning-foreground";
    case "LOW":
      return "border-status-healthy/30 bg-status-healthy/10 text-status-healthy";
    case "UNKNOWN":
      return "border-border bg-muted text-muted-foreground";
  }
}

function compareVulnerabilities(
  left: Vulnerability,
  right: Vulnerability,
  column: VulnerabilitySortColumn,
): number {
  if (column === "severity") {
    return (
      VULNERABILITY_SEVERITY_ORDER[left.severity] -
      VULNERABILITY_SEVERITY_ORDER[right.severity]
    );
  }
  if (column === "score") return (left.score ?? -1) - (right.score ?? -1);
  return (left[column] ?? "").localeCompare(right[column] ?? "");
}
