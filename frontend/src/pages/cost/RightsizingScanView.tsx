import {
  AlertTriangle,
  ChevronRight,
  Gauge,
  RefreshCw,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import type {
  RightsizingAction,
  RightsizingMetric,
  RightsizingPort,
  RightsizingScan,
} from "../../features/rightsizing/rightsizingContract";
import {
  filterRightsizingRows,
  flattenRightsizingScans,
  rightsizingClassCounts,
  type RightsizingClassFilter,
  type RightsizingScanRow,
} from "../../features/rightsizing/rightsizingModel";
import {
  formatRightsizingQuantity,
  rightsizingActionPresentation,
  rightsizingFitKey,
  rightsizingSignalKey,
} from "../../features/rightsizing/rightsizingPresentation";
import {
  useRightsizingScans,
  type RightsizingClusterScope,
  type RightsizingScanFrame,
} from "../../features/rightsizing/useRightsizingScans";
import { workloadDetailHref } from "../workload-detail/workloadDetailNavigation";
import { useI18n } from "../../shared/i18n";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Alert, AlertTitle } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Card, CardContent, CardHeader } from "../../shared/ui/primitives/card";
import { Collapse, CollapseChevron } from "../../shared/ui/primitives/collapse";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../shared/ui/primitives/empty";
import { Input } from "../../shared/ui/primitives/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../shared/ui/primitives/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/primitives/table";

const ROW_PAGE_SIZE = 50;
const CLASS_FILTERS = new Set<RightsizingClassFilter>([
  "actions",
  "increase",
  "reduction",
  "review",
  "in_range",
  "need_data",
]);

export function RightsizingScanView({
  port,
  scopes,
}: {
  port: RightsizingPort;
  scopes: readonly RightsizingClusterScope[];
}) {
  const { formatDate, formatNumber, t } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { frame, run } = useRightsizingScans(port, scopes);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const rows = useMemo(() => flattenRightsizingScans(frame.scans), [frame.scans]);
  const filters = useMemo(() => readFilters(params), [params]);
  const filterKey = [
    filters.classification,
    filters.kind,
    filters.namespace,
    filters.query,
  ].join("\u0000");
  const [pagination, setPagination] = useState({
    filterKey,
    visibleLimit: ROW_PAGE_SIZE,
  });
  const visibleLimit = pagination.filterKey === filterKey
    ? pagination.visibleLimit
    : ROW_PAGE_SIZE;
  const filteredRows = useMemo(
    () => filterRightsizingRows(rows, filters),
    [filters, rows],
  );
  const counts = useMemo(() => rightsizingClassCounts(rows), [rows]);
  const kinds = useMemo(
    () => [...new Set(rows.map((row) => row.workload.kind))].sort(),
    [rows],
  );
  const namespaces = useMemo(
    () => [...new Set(rows.flatMap((row) => row.workload.namespace ? [row.workload.namespace] : []))].sort(),
    [rows],
  );
  const visibleRows = filteredRows.slice(0, visibleLimit);
  const resultSummary = useMemo(() => summarizeScans(frame.scans), [frame.scans]);

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const resetFilters = () => {
    const next = new URLSearchParams(params);
    for (const key of ["rfClass", "rfKind", "rfNs", "rfQ"]) next.delete(key);
    setParams(next, { replace: true });
  };
  const activeFilters = filters.classification !== "actions" ||
    Boolean(filters.kind || filters.namespace || filters.query);

  return (
    <section
      aria-labelledby="rightsizing-scan-title"
      className="grid min-w-0 gap-4"
      id="cost-panel-rightsizing"
      role="tabpanel"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold" id="rightsizing-scan-title">
            <Gauge aria-hidden="true" className="size-4 text-muted-foreground" />
            {t("rightsizing.scan.title")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {t("rightsizing.scan.description")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("rightsizing.scan.scope", {
              clusters: scopes.length,
              namespaces: scopes.reduce((total, scope) => total + scope.namespaces.length, 0),
            })}
          </p>
        </div>
        <Button disabled={frame.phase === "loading"} onClick={() => void run()}>
          <RefreshCw
            aria-hidden="true"
            className={frame.phase === "loading" ? "animate-spin motion-reduce:animate-none" : ""}
          />
          {frame.phase === "idle" ? t("rightsizing.scan.run") : t("rightsizing.scan.runAgain")}
        </Button>
      </div>

      {frame.phase === "idle" ? (
        <FirstRunState onRun={() => void run()} />
      ) : (
        <>
          <ScanNotices frame={frame} summary={resultSummary} />
          {frame.phase === "loading" && frame.scans.length === 0 ? (
            <LoadingState />
          ) : frame.phase === "failed" ? (
            <FailureState onRun={() => void run()} />
          ) : resultSummary.observedScans === 0 ? (
            <UnavailableState onRun={() => void run()} />
          ) : (
            <>
              <ScanSummary
                counts={counts}
                onSelect={(classification) =>
                  setFilter("rfClass", classification === "actions" ? null : classification)}
                selected={filters.classification}
                summary={resultSummary}
              />
              <Card className="min-w-0">
                <CardHeader className="gap-3 border-b">
                  <ScanFilters
                    active={activeFilters}
                    kind={filters.kind}
                    kinds={kinds}
                    namespace={filters.namespace}
                    namespaces={namespaces}
                    onKind={(value) => setFilter("rfKind", value)}
                    onNamespace={(value) => setFilter("rfNs", value)}
                    onQuery={(value) => setFilter("rfQ", value)}
                    onReset={resetFilters}
                    query={filters.query}
                    shown={filteredRows.length}
                    total={rows.length}
                  />
                </CardHeader>
                <CardContent className="min-w-0 p-0">
                  {filteredRows.length === 0 ? (
                    <Empty className="min-h-56">
                      <EmptyHeader>
                        <EmptyTitle>
                          {rows.length === 0 ? t("rightsizing.scan.empty") : t("rightsizing.scan.noMatch")}
                        </EmptyTitle>
                      </EmptyHeader>
                      {activeFilters ? (
                        <EmptyContent>
                          <Button onClick={resetFilters} size="sm" variant="outline">
                            {t("rightsizing.scan.filters.reset")}
                          </Button>
                        </EmptyContent>
                      ) : null}
                    </Empty>
                  ) : (
                    <>
                      <Table scrollAreaLabel={t("rightsizing.scan.title")}>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-64">{t("rightsizing.scan.workload")}</TableHead>
                            <TableHead className="min-w-52">{t("rightsizing.scan.cpu")}</TableHead>
                            <TableHead className="min-w-52">{t("rightsizing.scan.memory")}</TableHead>
                            <TableHead className="min-w-48">{t("rightsizing.scan.impact")}</TableHead>
                            <TableHead className="w-10"><span className="sr-only">{t("common.action.open")}</span></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleRows.map((row) => (
                            <RightsizingResultRow
                              key={row.id}
                              onOpen={() => navigate(workloadDetailHref({
                                clusterId: row.clusterId,
                                apiGroup: row.workload.apiGroup,
                                apiVersion: row.workload.version,
                                kind: row.workload.kind,
                                namespace: row.workload.namespace,
                                name: row.workload.name,
                              }))}
                              onToggle={() => setOpenRow((current) => current === row.id ? null : row.id)}
                              open={openRow === row.id}
                              row={row}
                            />
                          ))}
                        </TableBody>
                      </Table>
                      {visibleRows.length < filteredRows.length ? (
                        <div className="flex justify-center border-t p-3">
                          <Button
                            onClick={() => setPagination({
                              filterKey,
                              visibleLimit: visibleLimit + ROW_PAGE_SIZE,
                            })}
                            size="sm"
                            variant="ghost"
                          >
                            {t("rightsizing.scan.showMore", {
                              count: Math.min(ROW_PAGE_SIZE, filteredRows.length - visibleRows.length),
                            })}
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
      {resultSummary.latestObservedAt === null ? null : (
        <p className="text-xs text-muted-foreground">
          {t("rightsizing.provenance", {
            start: formatDate(resultSummary.windowStartedAt!),
            end: formatDate(resultSummary.windowEndedAt!),
            collector: resultSummary.collectors.join(", "),
            revision: resultSummary.revisions.join(", "),
          })}
          {" · "}
          {formatNumber(resultSummary.observedScans)}
        </p>
      )}
    </section>
  );
}

function FirstRunState({ onRun }: { onRun: () => void }) {
  const { t } = useI18n();
  return (
    <Empty className="min-h-72 border bg-card">
      <EmptyMedia variant="icon"><Gauge aria-hidden="true" /></EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{t("rightsizing.scan.title")}</EmptyTitle>
        <EmptyDescription>{t("rightsizing.scan.methodology")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onRun}>{t("rightsizing.scan.run")}</Button>
      </EmptyContent>
    </Empty>
  );
}

function LoadingState() {
  const { t } = useI18n();
  return (
    <Empty className="min-h-72 border bg-card" role="status">
      <EmptyMedia variant="icon">
        <RefreshCw aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{t("rightsizing.scan.scanning")}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}

function FailureState({ onRun }: { onRun: () => void }) {
  const { t } = useI18n();
  return (
    <Empty className="min-h-72 border bg-card">
      <EmptyMedia variant="icon"><AlertTriangle aria-hidden="true" /></EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{t("rightsizing.scan.failed")}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onRun}>{t("rightsizing.scan.runAgain")}</Button>
      </EmptyContent>
    </Empty>
  );
}

function UnavailableState({ onRun }: { onRun: () => void }) {
  const { t } = useI18n();
  return (
    <Empty className="min-h-72 border bg-card">
      <EmptyMedia variant="icon"><Gauge aria-hidden="true" /></EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{t("rightsizing.scan.unavailable")}</EmptyTitle>
        <EmptyDescription>{t("rightsizing.scan.methodology")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onRun} variant="outline">{t("rightsizing.scan.runAgain")}</Button>
      </EmptyContent>
    </Empty>
  );
}

function ScanNotices({
  frame,
  summary,
}: {
  frame: RightsizingScanFrame;
  summary: ReturnType<typeof summarizeScans>;
}) {
  const { t } = useI18n();
  const notices = [
    frame.phase === "loading" && frame.scans.length > 0 ? t("rightsizing.scan.scanning") : null,
    frame.failures.length > 0 && frame.scans.length > 0 ? t("rightsizing.scan.refreshFailed") : null,
    summary.partialScans > 0 ? t("rightsizing.scan.partial") : null,
    summary.truncated ? t("rightsizing.scan.truncated") : null,
  ].filter((notice): notice is string => notice !== null);
  if (notices.length === 0) return null;
  return (
    <div className="grid gap-2">
      {notices.map((notice) => (
        <Alert key={notice}>
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>{notice}</AlertTitle>
        </Alert>
      ))}
    </div>
  );
}

function ScanSummary({
  counts,
  onSelect,
  selected,
  summary,
}: {
  counts: Readonly<Record<RightsizingAction, number>>;
  onSelect(value: RightsizingClassFilter): void;
  selected: RightsizingClassFilter;
  summary: ReturnType<typeof summarizeScans>;
}) {
  const { formatNumber, t } = useI18n();
  const actions = [
    ["reduction", "rightsizing.scan.action.reduction.helper"],
    ["increase", "rightsizing.scan.action.increase.helper"],
    ["review", "rightsizing.scan.action.review.helper"],
  ] as const;
  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-3">
          {actions.map(([action, helper]) => {
            const presentation = rightsizingActionPresentation(action);
            const isSelected = selected === action;
            return (
              <button
                aria-pressed={isSelected}
                className={[
                  "grid min-w-0 gap-2 rounded-lg border p-3 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "motion-reduce:transition-none",
                  isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                ].join(" ")}
                key={action}
                onClick={() => onSelect(isSelected ? "actions" : action)}
                type="button"
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <StatusMark label={t(presentation.key)} tone={presentation.tone} />
                  <Badge variant="outline">{formatNumber(counts[action])}</Badge>
                </span>
                <span className="text-xs text-muted-foreground">{t(helper)}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{t("rightsizing.scan.coverage", {
            evaluated: summary.workloadsEvaluated,
            discovered: summary.workloadsDiscovered,
          })}</span>
          <span className="flex flex-wrap gap-3">
            <button className="hover:text-foreground" onClick={() => onSelect("in_range")} type="button">
              {t("rightsizing.action.in_range")}: {formatNumber(counts.in_range)}
            </button>
            <button className="hover:text-foreground" onClick={() => onSelect("need_data")} type="button">
              {t("rightsizing.action.need_data")}: {formatNumber(counts.need_data)}
            </button>
            {selected === "actions" ? null : (
              <button className="font-medium text-primary hover:underline" onClick={() => onSelect("actions")} type="button">
                {t("rightsizing.scan.filters.reset")}
              </button>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ScanFilters({
  active,
  kind,
  kinds,
  namespace,
  namespaces,
  onKind,
  onNamespace,
  onQuery,
  onReset,
  query,
  shown,
  total,
}: {
  active: boolean;
  kind: string;
  kinds: readonly string[];
  namespace: string;
  namespaces: readonly string[];
  onKind(value: string | null): void;
  onNamespace(value: string | null): void;
  onQuery(value: string): void;
  onReset(): void;
  query: string;
  shown: number;
  total: number;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <label className="relative mr-auto min-w-56 flex-1 sm:max-w-sm">
        <span className="sr-only">{t("rightsizing.scan.filters.search")}</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
        <Input
          className="pl-8"
          onChange={(event) => onQuery(event.target.value)}
          placeholder={t("rightsizing.scan.filters.search")}
          value={query}
        />
      </label>
      <FilterSelect
        allLabel={t("rightsizing.scan.filters.allNamespaces")}
        ariaLabel={t("rightsizing.scan.filters.allNamespaces")}
        onChange={onNamespace}
        options={namespaces}
        value={namespace}
      />
      <FilterSelect
        allLabel={t("rightsizing.scan.filters.allKinds")}
        ariaLabel={t("rightsizing.scan.filters.allKinds")}
        onChange={onKind}
        options={kinds}
        value={kind}
      />
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {t("rightsizing.scan.results", { shown, total })}
      </span>
      {active ? (
        <Button onClick={onReset} size="sm" variant="ghost">
          {t("rightsizing.scan.filters.reset")}
        </Button>
      ) : null}
    </div>
  );
}

function FilterSelect({
  allLabel,
  ariaLabel,
  onChange,
  options,
  value,
}: {
  allLabel: string;
  ariaLabel: string;
  onChange(value: string | null): void;
  options: readonly string[];
  value: string;
}) {
  const items = [{ value: "__all__", label: allLabel }, ...options.map((option) => ({
    value: option,
    label: option,
  }))];
  return (
    <Select
      items={items}
      onValueChange={(next) => onChange(next === "__all__" ? null : next)}
      value={value || "__all__"}
    >
      <SelectTrigger aria-label={ariaLabel} className="max-w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RightsizingResultRow({
  onOpen,
  onToggle,
  open,
  row,
}: {
  onOpen(): void;
  onToggle(): void;
  open: boolean;
  row: RightsizingScanRow;
}) {
  const { formatNumber, t } = useI18n();
  return (
    <>
      <TableRow>
        <TableCell className="min-w-64 whitespace-normal">
          <button
            aria-expanded={open}
            className="flex w-full min-w-0 items-start gap-2 text-left"
            onClick={onToggle}
            type="button"
          >
            <CollapseChevron className="mt-0.5 size-4" open={open} />
            <span className="min-w-0">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge variant="outline">{row.workload.kind}</Badge>
                <strong className="truncate" title={row.workload.name}>{row.workload.name}</strong>
              </span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {row.clusterId} · {row.workload.namespace ?? "—"} · {row.container}
              </span>
            </span>
          </button>
        </TableCell>
        <TableCell><RequestCell metric={row.cpu} /></TableCell>
        <TableCell><RequestCell metric={row.memory} /></TableCell>
        <TableCell className="whitespace-normal">
          <p className="text-xs">{t("rightsizing.scan.replicas", { count: formatNumber(row.replicas) })}</p>
          {row.scaledToZero ? (
            <p className="mt-1 text-xs text-muted-foreground">{t("rightsizing.scaledToZero")}</p>
          ) : row.impact.cpuMillicoresChange === 0 && row.impact.memoryBytesChange === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">{t("rightsizing.scan.noImpact")}</p>
          ) : (
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              CPU {signed(row.impact.cpuMillicoresChange, formatNumber)} mCPU · Memory {signed(row.impact.memoryBytesChange, formatNumber)} bytes
            </p>
          )}
        </TableCell>
        <TableCell>
          <Button aria-label={t("rightsizing.scan.open")} onClick={onOpen} size="icon-sm" variant="ghost">
            <ChevronRight aria-hidden="true" />
          </Button>
        </TableCell>
      </TableRow>
      <TableRow className={open ? "" : "border-0"}>
        <TableCell className="p-0" colSpan={5}>
          <Collapse mountLazily open={open}>
            <div className="grid gap-3 border-t bg-muted/20 p-4 md:grid-cols-2">
              <MetricEvidence label={t("rightsizing.scan.cpu")} metric={row.cpu} />
              <MetricEvidence label={t("rightsizing.scan.memory")} metric={row.memory} />
            </div>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

function RequestCell({ metric }: { metric: RightsizingMetric | null }) {
  const { formatNumber, t } = useI18n();
  if (metric === null) return <span className="text-xs text-muted-foreground">—</span>;
  const presentation = rightsizingActionPresentation(metric.action);
  return (
    <div className="grid gap-1 text-xs">
      <p className="font-medium tabular-nums">
        {formatRightsizingQuantity(metric.currentRequest, formatNumber, t("rightsizing.unset"))}
        {" → "}
        {formatRightsizingQuantity(metric.recommendedRequest, formatNumber, t("rightsizing.unset"))}
      </p>
      <StatusMark label={t(presentation.key)} tone={presentation.tone} />
    </div>
  );
}

function MetricEvidence({
  label,
  metric,
}: {
  label: string;
  metric: RightsizingMetric | null;
}) {
  const { formatNumber, t } = useI18n();
  if (metric === null) return <p className="text-sm text-muted-foreground">{label}: —</p>;
  return (
    <div className="grid min-w-0 gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <Fact label={t("rightsizing.current")} value={formatRightsizingQuantity(metric.currentRequest, formatNumber, t("rightsizing.unset"))} />
        <Fact label={t("rightsizing.observed")} value={formatRightsizingQuantity(metric.observedDemand, formatNumber, t("rightsizing.unset"))} />
        <Fact label={t("rightsizing.suggested")} value={formatRightsizingQuantity(metric.recommendedRequest, formatNumber, t("rightsizing.unset"))} />
      </dl>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{t(rightsizingFitKey(metric.fit))}</Badge>
        <Badge variant="outline">{t("rightsizing.confidence", { confidence: metric.confidence })}</Badge>
        {metric.signals.map((signal) => (
          <Badge key={signal} variant="outline">{t(rightsizingSignalKey(signal))}</Badge>
        ))}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium tabular-nums" title={value}>{value}</dd>
    </div>
  );
}

function readFilters(params: URLSearchParams) {
  const rawClass = params.get("rfClass");
  return {
    classification: rawClass !== null && CLASS_FILTERS.has(rawClass as RightsizingClassFilter)
      ? rawClass as RightsizingClassFilter
      : "actions" as const,
    kind: safeFilterText(params.get("rfKind")),
    namespace: safeFilterText(params.get("rfNs")),
    query: safeFilterText(params.get("rfQ"), 200),
  };
}

function safeFilterText(value: string | null, maxLength = 253): string {
  if (value === null || value.length > maxLength || value !== value.trim()) return "";
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  }) ? "" : value;
}

function signed(
  value: number,
  formatNumber: (value: number | bigint) => string,
): string {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function summarizeScans(scans: readonly RightsizingScan[]) {
  const observed = scans.flatMap((scan) =>
    scan.result.availability === "unavailable" ? [] : [scan.result]);
  return {
    observedScans: observed.length,
    partialScans: observed.filter((scan) => scan.availability === "partial").length,
    workloadsDiscovered: observed.reduce((sum, scan) => sum + scan.coverage.workloadsDiscovered, 0),
    workloadsEvaluated: observed.reduce((sum, scan) => sum + scan.coverage.workloadsEvaluated, 0),
    truncated: observed.some((scan) => scan.coverage.truncated),
    latestObservedAt: observed.length === 0
      ? null
      : Math.max(...observed.map((scan) => Date.parse(scan.observedAt))),
    windowStartedAt: observed.length === 0
      ? null
      : Math.min(...observed.map((scan) => Date.parse(scan.provenance.windowStartedAt))),
    windowEndedAt: observed.length === 0
      ? null
      : Math.max(...observed.map((scan) => Date.parse(scan.provenance.windowEndedAt))),
    collectors: [...new Set(observed.map((scan) => scan.provenance.collector))].sort(),
    revisions: [...new Set(observed.map((scan) => scan.provenance.algorithmRevision))].sort(),
  };
}
