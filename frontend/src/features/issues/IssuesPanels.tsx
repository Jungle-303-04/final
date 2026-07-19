import {
  BrainCircuit,
  Check,
  ChevronsLeft,
  ChevronsRight,
  CircleCheck,
  Lightbulb,
  ShieldAlert,
  Sparkle,
  X,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/lib/cn";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { humanizeFilterValue } from "../../shared/presentation/humanizeFilterValue";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Progress } from "../../shared/ui/primitives/progress";
import { Spinner } from "../../shared/ui/primitives/spinner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../shared/ui/primitives/tabs";
import type {
  IssueEvidencePage,
  IssueRcaReportPage,
  IssueRecoveryPlan,
} from "./issuesContract";
import { IssueStatusMark } from "./IssueStatusMark";
import { issueRecoveryProgress } from "./issueRecoveryProgress";
import { IssueAuditTimelinePanel } from "./IssueAuditTimelinePanel";
import { IssueRecentChangesPanel } from "./IssueRecentChangesPanel";
import { evidenceFallbackLabel } from "./issueEvidencePresentation";
import type { IssueRcaNarrative } from "./issuesEvidenceContract";
import { IssueEmpty, IssueSectionFrame } from "./IssueSectionFrame";
import {
  isResolvedIssue,
  issueEvidenceCount,
  issueStatusTone,
  issueTitle,
} from "./issuePresentation";
import type {
  IssuesPanelsProps,
  IssuesSurfaceCopy,
  RecoverySelectionCapability,
  SectionState,
} from "./issuesSurfaceContract";

const RCA_EVIDENCE_SUMMARY_ID = "issue-rca-evidence-summary";
const RECOVERY_PANEL_ID = "issue-recovery-panel";
const DETAIL_TAB_CONTENT_MOTION = "animate-in fade-in-0 slide-in-from-bottom-1 duration-(--motion-soft) ease-(--ease-soft) motion-reduce:animate-none";

export function IssuesPanels({
  capability,
  copy,
  detailRegionId,
  detailRegionRef,
  full,
  onClose,
  onFullChange,
  onLoadMoreAudit,
  onSelectRecovery,
  selected,
  state,
}: IssuesPanelsProps) {
  const panelState = state;
  const [activeTab, setActiveTab] = useState("overview");
  const evidenceCount = panelState.evidence.data?.items.length ?? issueEvidenceCount(selected);
  const auditCount = panelState.audit.data?.items.length ?? null;
  const confidence = selected.confidence === null
    ? null
    : `${Math.round(selected.confidence * 100)}%`;
  const contextMeta = [
    { label: copy.cluster, value: selected.clusterId },
    { label: copy.namespace, value: selected.namespace },
    { label: copy.resourceKind, value: selected.resourceKind },
    { label: copy.target, value: selected.resourceName },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value?.trim()));
  const contextTitle = contextMeta.map(({ label, value }) => `${label} ${value}`).join(" | ");
  const jumpToEvidenceSummary = () => {
    setActiveTab("overview");
    window.setTimeout(() => {
      document.getElementById(RCA_EVIDENCE_SUMMARY_ID)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  };
  const jumpToRecovery = () => {
    setActiveTab("overview");
    window.setTimeout(() => {
      document.getElementById(RECOVERY_PANEL_ID)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  };

  return (
    <div
      aria-label={copy.detailLabel}
      className="min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 forced-colors:focus-visible:outline-2 lg:min-h-96"
      id={detailRegionId}
      ref={detailRegionRef}
      role="region"
      tabIndex={-1}
    >
      <div className="min-w-0 lg:max-h-[calc(100vh-10rem)]">
        <header className="sticky top-0 z-20 flex min-h-16 flex-row items-start gap-3 border-b bg-card/95 px-5 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <div className="flex shrink-0 items-center gap-1">
            <Button
              aria-label={copy.detailClose}
              className="cursor-pointer"
              onClick={onClose}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="min-w-0 break-words font-semibold leading-none">
                {issueTitle(selected)}
              </h2>
              <IssueStatusMark label={copy.statusLabel(selected.status)} tone={issueStatusTone(selected.status)} />
              {confidence !== null ? (
                <Badge variant="outline">
                  <BrainCircuit aria-hidden="true" />
                  {confidence}
                </Badge>
              ) : null}
            </div>
            {contextMeta.length > 0 ? (
              <dl className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" title={contextTitle}>
                {contextMeta.map(({ label, value }, index) => (
                  <div className="inline-flex min-w-0 items-center gap-1" key={`${label}:${value}`}>
                    {index > 0 ? <span className="shrink-0 text-border">|</span> : null}
                    <dt className="shrink-0 text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 truncate font-medium text-foreground/75">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              aria-label={full ? copy.detailCollapse : copy.detailExpand}
              className="hidden cursor-pointer lg:inline-flex"
              onClick={() => onFullChange(!full)}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              {full ? <ChevronsRight aria-hidden="true" /> : <ChevronsLeft aria-hidden="true" />}
            </Button>
          </div>
        </header>
        <div className="min-w-0 px-5 lg:overflow-y-auto lg:[scrollbar-gutter:stable]">
          <Tabs
            onValueChange={(value) => {
              if (value !== null) setActiveTab(value);
            }}
            value={activeTab}
          >
            <TabsList
              aria-label={copy.detailLabel}
              className="sticky top-0 z-10 w-full justify-start overflow-x-auto bg-card py-1"
              variant="line"
            >
              <TabsTrigger className="cursor-pointer" value="overview">{copy.detailLabel}</TabsTrigger>
              <TabsTrigger className="cursor-pointer" value="evidence">
                {copy.evidenceLabel}
                {evidenceCount !== null ? (
                  <Badge variant="secondary">{copy.listCount(evidenceCount)}</Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger className="cursor-pointer" value="timeline">
                {copy.auditLabel}
                {auditCount !== null ? (
                  <Badge variant="secondary">{copy.listCount(auditCount)}</Badge>
                ) : null}
              </TabsTrigger>
            </TabsList>

            <TabsContent className={cn("grid min-w-0 gap-6 py-4", DETAIL_TAB_CONTENT_MOTION)} value="overview">
              <IssueOverview
                copy={copy}
                onJumpToEvidenceSummary={jumpToEvidenceSummary}
                selected={selected}
                state={panelState.detail}
              />
              <IssueRecentChangesPanel copy={copy} state={panelState.recentChanges} />
              <ReportsPanel copy={copy} onOpenRecovery={jumpToRecovery} state={panelState.reports} />
              <div className="scroll-mt-16" id={RECOVERY_PANEL_ID}>
                <RecoveryPanel
                  capability={capability}
                  copy={copy}
                  onSelect={onSelectRecovery}
                  receipt={state.receipt}
                  selected={selected}
                  selectionFailure={state.selectionFailure}
                  selectionPendingId={state.selectionPendingId}
                  state={panelState.recovery}
                  audit={panelState.audit.data}
                />
              </div>
            </TabsContent>

            <TabsContent className={cn("grid min-w-0 gap-4 py-4", DETAIL_TAB_CONTENT_MOTION)} value="evidence">
              <EvidencePanel copy={copy} state={panelState.evidence} />
            </TabsContent>

            <TabsContent className={cn("grid min-w-0 gap-4 py-4", DETAIL_TAB_CONTENT_MOTION)} value="timeline">
              <IssueAuditTimelinePanel
                copy={copy}
                onLoadMore={onLoadMoreAudit}
                state={panelState.audit}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function IssueOverview({
  copy,
  onJumpToEvidenceSummary,
  selected,
  state,
}: {
  copy: IssuesSurfaceCopy;
  onJumpToEvidenceSummary: () => void;
  selected: IssuesPanelsProps["selected"];
  state: IssuesPanelsProps["state"]["detail"];
}) {
  const listEvidenceCount = issueEvidenceCount(selected);
  const resolved = isResolvedIssue(selected.status);
  const confidence = selected.confidence === null ? null : `${Math.round(selected.confidence * 100)}%`;
  const supportingCount = listEvidenceCount === null ? null : copy.listCount(listEvidenceCount);
  const detail = state.data;
  const missingEvidence = detail?.missingEvidence ?? selected.missingEvidence ?? [];
  const missingCount = missingEvidence.length;
  const summary = selected.situationSummary?.trim()
    || issueSituationSummary(selected, copy, resolved);
  return (
    <section className="grid min-w-0 gap-4 border-b pb-6" data-slot="issue-overview">
      <section className="grid min-w-0 gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{copy.situationSummary}</h3>
        <p className="break-words text-base font-medium leading-relaxed text-foreground">{summary}</p>
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
          <Badge variant={resolved ? "secondary" : "outline"}>
            {resolved ? copy.lifecycleClosed : copy.statusLabel(selected.status)}
          </Badge>
          {confidence !== null ? (
            <Badge variant="outline">{copy.confidence} {confidence}</Badge>
          ) : null}
          {supportingCount !== null ? (
            <Badge
              className="cursor-pointer hover:bg-muted"
              onClick={onJumpToEvidenceSummary}
              render={<button type="button" />}
              variant="outline"
            >
              {copy.supportingEvidence} {supportingCount}
            </Badge>
          ) : null}
        </div>
      </section>
      {missingCount > 0 ? (
        <section className="grid min-w-0 gap-2 border-l-2 border-status-warning bg-status-warning/10 py-2 pl-3 pr-2">
          <h4 className="flex items-center gap-2 text-xs font-medium text-foreground/80">
            <ShieldAlert aria-hidden="true" className="size-4 text-status-warning" />
            {copy.missingEvidence}
          </h4>
          <ul className="grid gap-1.5 text-xs text-muted-foreground">
            {missingEvidence.map((item, index) => (
              <li className="break-words" key={`${item}:${index}`}>• {humanizeFilterValue(item)}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {detail?.rootCause ? (
        <section className="grid min-w-0 gap-1 border-l-2 border-status-warning py-2 pl-3 pr-2">
          <h4 className="text-xs font-medium text-status-warning">{copy.rootCause}</h4>
          <p className="break-words text-sm">{copy.causeLabel(detail.rootCause)}</p>
        </section>
      ) : null}
    </section>
  );
}

function issueSituationSummary(
  selected: IssuesPanelsProps["selected"],
  copy: IssuesSurfaceCopy,
  resolved: boolean,
): string {
  const symptom = selected.symptom?.trim() || issueTitle(selected);
  const cause = selected.rootCause ? copy.causeLabel(selected.rootCause) : null;
  const status = resolved ? copy.lifecycleClosed : copy.statusLabel(selected.status);
  return copy.situationSummaryText(humanizeFilterValue(symptom), cause ?? "", status);
}

function EvidencePanel({
  copy,
  state,
}: {
  copy: IssuesSurfaceCopy;
  state: SectionState<IssueEvidencePage>;
}) {
  return (
    <IssueSection title={copy.evidenceLabel}>
      <IssueSectionFrame copy={copy} state={state} unavailable={copy.evidenceUnavailable}>
        {(page) => page.items.length === 0 ? (
          <IssueEmpty text={copy.sectionEmpty} />
        ) : (
          <ul className="divide-y">
            {page.items.map((record) => (
              <li className="grid min-w-0 gap-3 py-4 first:pt-0 last:pb-0" key={record.id}>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <p className="truncate font-medium" title={record.summary}>
                    {copy.evidenceRecordLabel(record.summary)}
                  </p>
                  <Badge className="max-w-40 truncate" title={record.kind} variant="outline">
                    {copy.evidenceKindLabel(record.kind)}
                  </Badge>
                </div>
                <div className="flex min-w-0 items-center gap-3 overflow-hidden text-xs text-muted-foreground">
                  {record.clusterId ? <span className="shrink-0 truncate">{record.clusterId}</span> : null}
                  {record.evidenceRef ? (
                    <span className="min-w-0 flex-1 truncate font-mono" title={record.evidenceRef}>
                      {record.evidenceRef}
                    </span>
                  ) : null}
                  {record.createdAt ? (
                    <time className="shrink-0 tabular-nums" dateTime={record.createdAt}>
                      {copy.auditTime(record.createdAt)}
                    </time>
                  ) : null}
                </div>
                <ul className="divide-y border-t text-sm text-muted-foreground">
                  {record.sources.map((source, index) => (
                    <li className="grid min-w-0 gap-1 py-2.5" key={`${source.source}:${index}`}>
                      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
                        <Badge className="max-w-44 truncate" title={source.source} variant="secondary">
                          {copy.evidenceSourceLabel(source.source)}
                        </Badge>
                        {source.collector ? (
                          <span
                            className="truncate font-mono text-[11px]"
                            title={`${source.collector}${source.collectorVersion ? `@${source.collectorVersion}` : ""}`}
                          >
                            {copy.evidenceCollectorLabel(
                              `${source.collector}${source.collectorVersion ? `@${source.collectorVersion}` : ""}`,
                            )}
                          </span>
                        ) : null}
                      </div>
                      <p className="truncate leading-relaxed" title={source.summary}>
                        {copy.evidenceSummaryLabel(source.source, source.summary)}
                      </p>
                      {source.collectedAt ? (
                        <time className="text-[11px] tabular-nums" dateTime={source.collectedAt}>
                          {copy.auditTime(source.collectedAt)}
                        </time>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </IssueSectionFrame>
    </IssueSection>
  );
}

function ReportsPanel({
  copy,
  onOpenRecovery,
  state,
}: {
  copy: IssuesSurfaceCopy;
  onOpenRecovery: () => void;
  state: SectionState<IssueRcaReportPage>;
}) {
  return (
    <IssueSection title={copy.reportsLabel}>
      <IssueSectionFrame copy={copy} state={state} unavailable={copy.reportsUnavailable}>
        {(page) => page.items.length === 0 ? (
          <IssueEmpty text={copy.reportsEmpty} />
        ) : (
          <ul className="grid gap-6">
            {page.items.map((report, index) => (
              <li className="grid min-w-0 gap-5" key={report.id}>
                <ReportMetaHeader copy={copy} report={report} />
                {report.narrative ? <ReportNarrative copy={copy} narrative={report.narrative} /> : null}

                <dl className="grid min-w-0 gap-2 border-b border-dashed pb-4">
                  {report.symptom ? (
                    <ReportLine label={copy.symptom} value={humanizeFilterValue(report.symptom)} />
                  ) : null}
                  {[report.namespace, report.resourceKind, report.resourceName].some(Boolean) ? (
                    <ReportLine
                      label={copy.impactScope}
                      value={[report.namespace, report.resourceKind, report.resourceName].filter(Boolean).join(" | ")}
                    />
                  ) : null}
                </dl>

                <ReportNumberedSection
                  body={finalJudgementLabel(report, copy)}
                  number="01"
                  title={copy.finalJudgement}
                />
                <ReportNumberedSection number="02" title={copy.finalCause}>
                  <div className="grid min-w-0 gap-3">
                    <ReportCandidateAccordion copy={copy} report={report} />
                  </div>
                </ReportNumberedSection>
                <ReportNumberedSection
                  id={index === 0 ? RCA_EVIDENCE_SUMMARY_ID : undefined}
                  number="03"
                  title={copy.evidenceSummaryTitle}
                >
                  <ReportEvidenceSummary copy={copy} report={report} />
                </ReportNumberedSection>
                <ReportNumberedSection number="04" title={copy.evidenceDetailsTitle}>
                  <ReportSelectedEvidenceDetails copy={copy} report={report} />
                </ReportNumberedSection>
                <ReportNumberedSection number="05" title={copy.recommendedActionTitle}>
                  <div className="grid min-w-0 gap-3">
                    <p className="break-words text-sm font-semibold leading-relaxed">
                      {recommendedActionLabel(report, copy)}
                    </p>
                    <Button
                      className="cursor-pointer justify-self-end border-black bg-black text-white hover:bg-black/85 hover:text-white dark:border-white dark:bg-white dark:text-black dark:hover:bg-white/90"
                      onClick={onOpenRecovery}
                      size="sm"
                      type="button"
                    >
                      {copy.viewRecoveryAction}
                    </Button>
                  </div>
                </ReportNumberedSection>
              </li>
            ))}
          </ul>
        )}
      </IssueSectionFrame>
    </IssueSection>
  );
}

type RcaReportItem = IssueRcaReportPage["items"][number];

function ReportMetaHeader({ copy, report }: { copy: IssuesSurfaceCopy; report: RcaReportItem }) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-dashed pb-4">
      <ReportMeta label={copy.actionRisk} value={copy.riskLabel(report.severity)} />
      <ReportMeta
        label={copy.confidence}
        value={report.confidence === null ? copy.valueUnknown : `${Math.round(report.confidence * 100)}%`}
      />
      <ReportMeta
        label={copy.time}
        value={report.createdAt ? compactReportTime(report.createdAt, copy) : copy.valueUnknown}
      />
    </div>
  );
}

function ReportMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-sm font-semibold" title={value}>{value}</span>
    </div>
  );
}

function ReportLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-center gap-2">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium" title={value}>{value}</dd>
    </div>
  );
}

function ReportNumberedSection({
  body,
  children,
  id,
  number,
  title,
}: {
  body?: string;
  children?: React.ReactNode;
  id?: string;
  number: string;
  title: string;
}) {
  return (
    <section className="grid min-w-0 scroll-mt-16 grid-cols-[3.25rem_minmax(0,1fr)] gap-3 border-b border-dashed pb-5 last:border-b-0 last:pb-0" id={id}>
      <span className="grid min-h-full grid-cols-[auto_auto] gap-2 self-stretch text-lg font-semibold tabular-nums leading-tight text-muted-foreground">
        <span>{number}</span>
        <span aria-hidden="true" className="h-full border-l border-foreground/45" />
      </span>
      <div className="grid min-w-0 gap-2">
        <h4 className="text-lg font-semibold leading-tight">{title}</h4>
        {body ? <p className="break-words text-sm leading-relaxed text-foreground">{body}</p> : null}
        {children}
      </div>
    </section>
  );
}

function ReportEvidenceSummary({
  copy,
  report,
}: {
  copy: IssuesSurfaceCopy;
  report: RcaReportItem;
}) {
  const confirmed = report.supportingEvidenceRefs.length > 0
    ? report.supportingEvidenceRefs.map((evidence) => evidenceDisplayName(evidence.source, evidence.name, copy))
    : report.supportingEvidence.map((item) => evidenceDisplayNameFromToken(item, copy));
  if (confirmed.length === 0) {
    return <p className="text-sm text-muted-foreground">{copy.sectionEmpty}</p>;
  }
  return (
    <ul className="grid gap-1.5 text-sm leading-relaxed">
      {confirmed.slice(0, 4).map((item, index) => (
        <li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2" key={`${item}:${index}`}>
          <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-status-healthy" />
          <span className="break-words">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ReportCandidateAccordion({
  copy,
  report,
}: {
  copy: IssuesSurfaceCopy;
  report: RcaReportItem;
}) {
  if (report.candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">{copy.sectionEmpty}</p>;
  }
  const selectedCandidate = report.candidates.find(({ id }) => id === report.selectedCandidateId)
    ?? report.candidates[0];
  const candidateOptions = report.candidates.filter(({ id }) => id !== selectedCandidate.id);
  const selectedSupportingCount = selectedCandidate.supportingEvidence.length;
  const selectedMissingCount = selectedCandidate.missingEvidence.length;
  return (
    <div className="grid min-w-0 gap-4">
      <section className="grid min-w-0 gap-2 bg-muted/35 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <h5 className="min-w-0 flex-1 truncate text-sm font-semibold" title={selectedCandidate.title ?? selectedCandidate.id}>
            {selectedCandidate.title ?? humanizeFilterValue(selectedCandidate.id)}
          </h5>
          <Badge className="border-status-healthy/30 bg-status-healthy/10 text-status-healthy" variant="outline">
            {copy.recommended}
          </Badge>
          {selectedCandidate.score !== null ? (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {Math.round(selectedCandidate.score * 100)}%
            </span>
          ) : null}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {copy.evidenceCoverage(selectedSupportingCount, selectedSupportingCount + selectedMissingCount)}
        </p>
        {selectedCandidate.supportingEvidence.length > 0 ? (
          <EvidenceTokenList
            copy={copy}
            items={selectedCandidate.supportingEvidence}
            label={copy.supportingEvidence}
            tone="healthy"
          />
        ) : null}
        {selectedCandidate.missingEvidence.length > 0 ? (
          <EvidenceTokenList
            copy={copy}
            items={selectedCandidate.missingEvidence}
            label={copy.missingEvidence}
            tone="warning"
          />
        ) : null}
      </section>
      {candidateOptions.length > 0 ? (
        <section className="grid min-w-0 gap-2">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h5 className="text-xs font-medium text-muted-foreground">{copy.causeCandidates}</h5>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{copy.itemCount(candidateOptions.length)}</span>
          </div>
          <div className="grid overflow-hidden border-y border-dashed">
            {candidateOptions.map((candidate) => {
        const supportingCount = candidate.supportingEvidence.length;
        const missingCount = candidate.missingEvidence.length;
        return (
          <details
            className="group border-b border-dashed last:border-b-0 open:bg-muted/35"
            key={candidate.id}
          >
            <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 truncate text-sm font-medium" title={candidate.title ?? candidate.id}>
                {candidate.title ?? humanizeFilterValue(candidate.id)}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {candidate.score !== null ? `${Math.round(candidate.score * 100)}%` : copy.valueUnknown}
              </span>
              <Sparkle
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-[color,transform] duration-(--motion-instant) group-hover:text-foreground/80 group-open:rotate-45 group-open:text-foreground motion-reduce:transition-none"
                strokeWidth={1.8}
              />
            </summary>
            <div className="grid gap-2 border-t px-3 py-3 animate-in fade-in-0 slide-in-from-top-1 duration-(--motion-instant) ease-(--ease-soft) motion-reduce:animate-none">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {copy.evidenceCoverage(supportingCount, supportingCount + missingCount)}
              </p>
              {candidate.reason ? (
                <p className="break-words text-xs leading-relaxed text-muted-foreground">{candidate.reason}</p>
              ) : null}
              {candidate.supportingEvidence.length > 0 ? (
                <EvidenceTokenList
                  copy={copy}
                  items={candidate.supportingEvidence}
                  label={copy.supportingEvidence}
                  tone="healthy"
                />
              ) : null}
              {candidate.missingEvidence.length > 0 ? (
                <EvidenceTokenList
                  copy={copy}
                  items={candidate.missingEvidence}
                  label={copy.missingEvidence}
                  tone="warning"
                />
              ) : null}
            </div>
          </details>
        );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ReportSelectedEvidenceDetails({
  copy,
  report,
}: {
  copy: IssuesSurfaceCopy;
  report: RcaReportItem;
}) {
  if (report.supportingEvidenceRefs.length > 0) {
    return (
      <ul className="grid gap-2">
        {report.supportingEvidenceRefs.map((evidence, index) => (
          <li
            className="grid min-w-0 grid-cols-[7.25rem_minmax(0,1fr)] items-start gap-3 py-2"
            key={`${evidence.source}:${evidence.name}:${index}`}
          >
            <Badge className="w-fit max-w-full truncate" title={evidence.source} variant="secondary">
              {evidenceSourceDisplayName(evidence.source, copy)}
            </Badge>
            <div className="grid min-w-0 gap-1">
              <span className="truncate text-sm font-medium" title={evidence.name}>
                {evidenceNameDisplayName(evidence.name, copy)}
              </span>
              {evidence.summary ? (
                <p className="line-clamp-3 break-words text-xs leading-relaxed text-muted-foreground" title={evidence.summary}>
                  {evidence.summary}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    );
  }
  const selected = report.candidates.find(({ id }) => id === report.selectedCandidateId);
  const fallback = selected?.supportingEvidence.length
    ? selected.supportingEvidence
    : report.supportingEvidence;
  if (fallback.length === 0) return <p className="text-sm text-muted-foreground">{copy.sectionEmpty}</p>;
  return (
    <EvidenceTokenList
      copy={copy}
      items={fallback}
      label={copy.supportingEvidence}
      tone="healthy"
    />
  );
}

function EvidenceTokenList({
  copy,
  items,
  label,
  tone,
}: {
  copy: IssuesSurfaceCopy;
  items: readonly string[];
  label: string;
  tone: "healthy" | "warning";
}) {
  return (
    <section className="grid gap-1">
      <h5
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium",
          tone === "healthy" ? "text-status-healthy" : "text-foreground/80",
        )}
      >
        {tone === "warning" ? (
          <ShieldAlert aria-hidden="true" className="size-3.5 text-status-warning" />
        ) : null}
        {label}
      </h5>
      <p className="break-words text-xs leading-relaxed text-muted-foreground">
        {items.map((item) => evidenceDisplayNameFromToken(item, copy)).join(" · ")}
      </p>
    </section>
  );
}

function selectedCandidateTitle(report: RcaReportItem, copy: IssuesSurfaceCopy): string {
  return report.candidates.find(({ id }) => id === report.selectedCandidateId)?.title
    ?? copy.causeLabel(report.rootCause);
}

function finalJudgementLabel(report: RcaReportItem, copy: IssuesSurfaceCopy): string {
  const cause = selectedCandidateTitle(report, copy);
  const symptom = report.symptom ? humanizeFilterValue(report.symptom) : copy.listLabel;
  return copy.finalJudgementText(cause, symptom);
}

function recommendedActionLabel(report: RcaReportItem, copy: IssuesSurfaceCopy): string {
  if (report.action === "plan_recovery") {
    if (report.rootCause === "oom_killed") return copy.memoryRecommendation;
    return copy.reviewRecoveryPlan;
  }
  return evidenceFallbackLabel(report.action);
}

function compactReportTime(value: string, copy: IssuesSurfaceCopy): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return copy.auditTime(value);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}.${day} ${hours}:${minutes}`;
}

function evidenceDisplayName(source: string, name: string, copy: IssuesSurfaceCopy): string {
  const sourceLabel = evidenceSourceDisplayName(source, copy);
  const nameLabel = evidenceNameDisplayName(name, copy);
  if (sourceLabel === nameLabel) return sourceLabel;
  return `${sourceLabel} · ${nameLabel}`;
}

function evidenceDisplayNameFromToken(token: string, copy: IssuesSurfaceCopy): string {
  const [source, name] = token.split(":", 2);
  if (!name) return evidenceFallbackLabel(token);
  return evidenceDisplayName(source, name, copy);
}

function evidenceSourceDisplayName(source: string, copy: IssuesSurfaceCopy): string {
  const normalized = source.trim().toLowerCase();
  if (normalized === "kubernetes") return "Kubernetes";
  if (normalized === "logs") return "Loki";
  if (normalized === "metrics" || normalized === "traces") return copy.evidenceSourceLabel(source);
  return humanizeFilterValue(source);
}

function evidenceNameDisplayName(name: string, copy: IssuesSurfaceCopy): string {
  return copy.evidenceNameLabel(name);
}

function ReportNarrative({
  copy,
  narrative,
}: {
  copy: IssuesSurfaceCopy;
  narrative: IssueRcaNarrative;
}) {
  return (
    <article className="grid min-w-0 gap-4 border-y border-primary/20 py-4">
      <header className="flex items-center gap-2 text-sm font-semibold">
        <BrainCircuit aria-hidden="true" className="size-4 text-primary" />
        <h4>{copy.narrativeLabel}</h4>
      </header>
      <NarrativeText
        label={copy.narrativeSummary}
        value={narrative.executiveSummary}
      />
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <NarrativeText label={copy.narrativeImpact} value={narrative.impact} />
        <NarrativeText label={copy.narrativeReasoning} value={narrative.reasoning} />
      </div>
      <section className="grid gap-1 border-l-2 border-status-healthy py-2 pl-3">
        <h5 className="text-xs font-medium text-status-healthy">
          {copy.narrativeRecommendedAction}
        </h5>
        <p className="break-words text-sm leading-relaxed">{narrative.recommendedAction}</p>
      </section>
      {narrative.recurrencePrevention.length > 0 || narrative.limitations.length > 0 ? (
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          {narrative.recurrencePrevention.length > 0 ? (
            <NarrativeList
              items={narrative.recurrencePrevention}
              label={copy.narrativeRecurrencePrevention}
            />
          ) : null}
          {narrative.limitations.length > 0 ? (
            <NarrativeList
              items={narrative.limitations}
              label={copy.narrativeLimitations}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function NarrativeText({ label, value }: { label: string; value: string }) {
  return (
    <section className="grid gap-1">
      <h5 className="text-xs font-medium text-muted-foreground">{label}</h5>
      <p className="break-words text-sm leading-relaxed">{value}</p>
    </section>
  );
}

function NarrativeList({ items, label }: { items: readonly string[]; label: string }) {
  return (
    <section className="grid min-w-0 gap-1.5 border-t pt-3">
      <h5 className="text-xs font-medium text-muted-foreground">{label}</h5>
      <ul className="grid gap-1.5 text-xs leading-relaxed">
        {items.map((item, index) => (
          <li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2" key={`${item}:${index}`}>
            <span aria-hidden="true">•</span>
            <span className="break-words">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecoveryPanel({
  audit,
  capability,
  copy,
  onSelect,
  receipt,
  selected,
  selectionFailure,
  selectionPendingId,
  state,
}: {
  audit: IssuesPanelsProps["state"]["audit"]["data"];
  capability: RecoverySelectionCapability;
  copy: IssuesSurfaceCopy;
  onSelect: (actionId: string) => void;
  selected: IssuesPanelsProps["selected"];
  receipt: { eventId: string } | null;
  selectionFailure: IssuesPanelsProps["state"]["selectionFailure"];
  selectionPendingId: string | null;
  state: SectionState<IssueRecoveryPlan>;
}) {
  const candidateScope = `${selected.correlationId}:${state.data?.id ?? ""}`;
  const [openCandidates, setOpenCandidates] = useState<{
    ids: ReadonlySet<string>;
    scope: string;
  }>({ ids: new Set(), scope: candidateScope });

  const recoveryProgress = issueRecoveryProgress({
    audit,
    plan: state.data,
    receipt: receipt === null
      ? null
      : { accepted: true, correlationId: selected.correlationId, eventId: receipt.eventId },
    selected,
    selectionFailed: selectionFailure !== null,
    selectionPending: selectionPendingId !== null,
  });
  return (
    <IssueSection contentClassName="gap-5" title={copy.recoveryLabel}>
      <RecoveryProgress
        copy={copy}
        progress={recoveryProgress}
        selectionAccepted={receipt !== null && selectionPendingId === null}
      />
      {selectionFailure !== null ? (
        <Alert variant="destructive">
          <XCircle aria-hidden="true" />
          <AlertDescription>{copy.failureDetail(selectionFailure.code)}</AlertDescription>
        </Alert>
      ) : null}
      {receipt ? (
        <Alert title={receipt.eventId}>
          <AlertDescription>
            {copy.selectionReceived(
              receipt.eventId.length > 12 ? `${receipt.eventId.slice(0, 8)}…` : receipt.eventId,
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      <IssueSectionFrame copy={copy} state={state} unavailable={copy.recoveryUnavailable}>
        {(plan) => {
          const displayPlan = plan;
          const recommendedCandidate = displayPlan.candidates.find(({ id }) => id === displayPlan.recommendedActionId)
            ?? displayPlan.candidates[0];
          const candidateOptions = displayPlan.candidates.filter(({ id }) => id !== recommendedCandidate?.id);
          const resolvedOpenCandidateIds = openCandidates.scope === candidateScope
            ? openCandidates.ids
            : new Set<string>();
          const toggleCandidate = (candidateId: string) => {
            setOpenCandidates((current) => {
              const next = new Set(current.scope === candidateScope ? current.ids : []);
              if (next.has(candidateId)) next.delete(candidateId);
              else next.add(candidateId);
              return { ids: next, scope: candidateScope };
            });
          };
          return (
          <div className="grid gap-4">
            <Badge className="w-fit" variant="outline">{copy.statusLabel(displayPlan.status)}</Badge>
            {displayPlan.candidates.length === 0 ? <IssueEmpty text={copy.sectionEmpty} /> : (
              <section className="grid gap-3 border-t border-dashed pt-4">
                <div className="flex min-w-0 items-end justify-between gap-3">
                  <h3 className="text-xs font-semibold text-muted-foreground">{copy.recommendedRecoveryActions}</h3>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {copy.itemCount(1)}
                  </span>
                </div>
                {recommendedCandidate ? (
                  <section className="grid min-w-0 gap-3 bg-muted/35 p-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <Lightbulb aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                        <h4 className="min-w-0 truncate text-sm font-semibold leading-snug" title={recommendedCandidate.title}>
                          {recommendedCandidate.title}
                        </h4>
                      </span>
                      <Badge className="border-status-healthy/30 bg-status-healthy/10 text-status-healthy" variant="outline">
                        {copy.recommended}
                      </Badge>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {Math.round(recommendedCandidate.score * 100)}%
                      </span>
                    </div>
                    <RecoveryCandidateDetails
                      candidate={recommendedCandidate}
                      capability={capability}
                      copy={copy}
                      onSelect={onSelect}
                      selectionPendingId={selectionPendingId}
                    />
                  </section>
                ) : null}
                {candidateOptions.length > 0 ? (
                  <>
                    <div className="flex min-w-0 items-center justify-between gap-3 pt-1">
                      <h3 className="text-xs font-semibold text-muted-foreground">{copy.otherRecoveryCandidates}</h3>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {copy.itemCount(candidateOptions.length)}
                      </span>
                    </div>
                <ul className="grid overflow-hidden border-y border-dashed">
                  {candidateOptions.map((candidate) => {
                    const open = resolvedOpenCandidateIds.has(candidate.id);
                    return (
                      <li
                        className={cn("min-w-0 border-b border-dashed last:border-b-0", open && "bg-muted/35")}
                        key={candidate.id}
                      >
                      <button
                        aria-expanded={open}
                        className={cn(
                          "group grid w-full min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 p-3 text-left transition-colors hover:bg-muted/35 motion-reduce:transition-none",
                          open && "bg-muted/25",
                        )}
                        onClick={() => toggleCandidate(candidate.id)}
                        type="button"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Lightbulb aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 truncate text-sm font-semibold" title={candidate.title}>
                            {candidate.title}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {Math.round(candidate.score * 100)}%
                          </span>
                        </span>
                        <Sparkle
                          aria-hidden="true"
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground transition-[color,transform] duration-(--motion-instant) group-hover:text-foreground/80 motion-reduce:transition-none",
                            open && "rotate-45 text-foreground",
                          )}
                          strokeWidth={1.8}
                        />
                      </button>
                      {open ? (
                        <RecoveryCandidateDetails
                          candidate={candidate}
                          capability={capability}
                          className="px-3 pb-3"
                          copy={copy}
                          onSelect={onSelect}
                          selectionPendingId={selectionPendingId}
                        />
                      ) : null}
                      </li>
                    );
                  })}
                </ul>
                  </>
                ) : null}
              </section>
            )}
          </div>
          );
        }}
      </IssueSectionFrame>
    </IssueSection>
  );
}

function RecoveryCandidateDetails({
  candidate,
  capability,
  className,
  copy,
  onSelect,
  selectionPendingId,
}: {
  candidate: IssueRecoveryPlan["candidates"][number];
  capability: RecoverySelectionCapability;
  className?: string;
  copy: IssuesSurfaceCopy;
  onSelect: (actionId: string) => void;
  selectionPendingId: string | null;
}) {
  return (
    <div className={cn("grid min-w-0 gap-5 text-sm animate-in fade-in-0 slide-in-from-top-1 duration-(--motion-instant) ease-(--ease-soft) motion-reduce:animate-none", className)}>
      <dl className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <div className="inline-flex min-w-0 items-center gap-1.5">
          <dt className="shrink-0">{copy.actionRisk}</dt>
          <dd className="w-fit rounded-md bg-muted/55 px-2 py-1 font-medium text-foreground/80">
            {copy.riskLabel(candidate.riskLevel)}
          </dd>
        </div>
        <span aria-hidden="true" className="text-border">|</span>
        <div className="inline-flex min-w-0 items-center gap-1.5">
          <dt className="shrink-0">{copy.impactScope}</dt>
          <dd className="w-fit max-w-full truncate rounded-md bg-muted/55 px-2 py-1 font-medium text-foreground/80" title={candidate.blastRadius}>
            {candidate.blastRadius}
          </dd>
        </div>
      </dl>
      {candidate.recommendationReason ? (
        <section className="grid gap-2 border-t pt-5">
          <h4 className="text-xs font-medium text-muted-foreground">{copy.recommendationReason}</h4>
          <p className="break-words text-sm font-medium leading-relaxed text-foreground">
            {candidate.recommendationReason}
          </p>
        </section>
      ) : null}
      {candidate.expectedOutcome ? (
        <section className="grid gap-2 border-t pt-5">
          <h4 className="text-xs font-medium text-muted-foreground">{copy.expectedOutcome}</h4>
          <p className="break-words text-sm font-medium leading-relaxed text-foreground">
            {candidate.expectedOutcome}
          </p>
        </section>
      ) : null}
      {candidate.riskExplanation ? (
        <section className="grid gap-2 border-t pt-5">
          <h4 className="text-xs font-medium text-muted-foreground">{copy.riskExplanation}</h4>
          <p className="break-words text-sm font-medium leading-relaxed text-foreground">
            {candidate.riskExplanation}
          </p>
        </section>
      ) : null}
      <section className="grid gap-2 border-t pt-5">
        <h4 className="text-xs font-medium text-muted-foreground">{copy.actionToRun}</h4>
        <p className="break-words text-sm font-medium leading-relaxed text-foreground">{candidate.description}</p>
      </section>
      {candidate.validationChecks.length > 0 ? (
        <section className="grid gap-2 border-t pt-5">
          <h4 className="text-xs font-medium text-muted-foreground">{copy.validationChecks}</h4>
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {candidate.validationChecks.map((check, index) => (
              <li className="flex items-start gap-1.5 break-words" key={`${check}:${index}`}>
                <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                {check}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {candidate.rollbackPlan ? (
        <section className="grid gap-2 border-t pt-5">
          <h4 className="text-xs font-medium text-muted-foreground">{copy.rollbackAction}</h4>
          {candidate.rollbackReason ? (
            <p className="break-words text-sm font-medium leading-relaxed text-foreground">
              {candidate.rollbackReason}
            </p>
          ) : null}
          <p className="border-l border-foreground/20 pl-3 text-xs leading-relaxed text-muted-foreground">
            {candidate.rollbackPlan}
          </p>
        </section>
      ) : null}
      {capability.state === "hidden" ? null : (
        <div className="flex justify-end pt-1">
          <Button
            aria-describedby={capability.state === "disabled"
              ? `recovery-capability-${candidate.id}`
              : undefined}
            aria-label={candidate.title}
            className="enabled:cursor-pointer"
            disabled={capability.state === "disabled" || selectionPendingId !== null}
            onClick={() => onSelect(candidate.id)}
            type="button"
          >
            {selectionPendingId === candidate.id ? (
              <>
                <Spinner decorative />
                {copy.selectionPending}
              </>
            ) : copy.selectRecoveryAction}
          </Button>
        </div>
      )}
      {capability.state === "disabled" ? (
        <p
          className="text-sm text-muted-foreground"
          id={`recovery-capability-${candidate.id}`}
        >
          {capability.reason}
        </p>
      ) : null}
    </div>
  );
}

function RecoveryProgress({
  copy,
  progress,
  selectionAccepted,
}: {
  copy: IssuesSurfaceCopy;
  progress: ReturnType<typeof issueRecoveryProgress>;
  selectionAccepted: boolean;
}) {
  const steps = [
    copy.recoveryProgressApproval,
    copy.recoveryProgressSubmission,
    copy.recoveryProgressExecution,
    copy.recoveryProgressVerification,
    copy.recoveryProgressCompletion,
  ];
  const activeLabel = progress.phase === "failed"
    ? copy.recoveryProgressFailed
    : progress.phase === "approval"
      ? copy.recoveryProgressApprovalWaiting
      : progress.phase === "submitting" && selectionAccepted
        ? copy.recoveryProgressAccepted
        : steps[progress.activeStep];
  const progressTone = progress.phase === "failed"
    ? "failed"
    : progress.phase === "approval"
      ? "approval"
      : "active";
  const progressToneClass = progressTone === "failed"
    ? "[&_div[data-slot=progress-indicator]]:bg-destructive"
    : progressTone === "approval"
      ? "[&_div[data-slot=progress-indicator]]:bg-status-warning"
      : "[&_div[data-slot=progress-indicator]]:bg-primary";
  const activeMarkerClass = progressTone === "failed"
    ? "border-destructive bg-destructive text-destructive-foreground"
    : progressTone === "approval"
      ? "border-status-warning bg-status-warning text-foreground"
      : "border-primary bg-primary text-primary-foreground";
  const markerAlignedProgress = progress.phase === "completed"
    ? 100
    : Math.min(100, Math.max(0, ((progress.activeStep + 0.5) / steps.length) * 100));
  return (
    <section
      aria-live="polite"
      className="grid min-w-0 gap-4 border-y py-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={activeLabel}>
            {activeLabel}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{copy.recoveryProgressLabel}</p>
        </div>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {progress.phase === "failed" ? copy.recoveryProgressStopped : `${progress.progress}%`}
        </span>
      </div>
      <Progress
        aria-label={copy.recoveryProgressLabel}
        className={cn("h-1.5", progressToneClass)}
        value={markerAlignedProgress}
        valueText={activeLabel}
      />
      <ol className="grid min-w-0 grid-cols-5 gap-2 border-t border-dashed pt-3" aria-label={copy.recoveryProgressLabel}>
        {steps.map((label, index) => {
          const completed = progress.phase === "completed" || index < progress.activeStep;
          const active = index === progress.activeStep;
          const failed = progress.phase === "failed" && active;
          const completedBeforeFailure = progress.phase === "failed" && completed;
          return (
            <li className="grid min-w-0 justify-items-center gap-1.5 text-center" key={label}>
              <span className={cn(
                "grid size-6 place-items-center rounded-md border bg-card text-[10px] font-semibold tabular-nums text-muted-foreground",
                completed && "border-foreground/10 bg-muted/35 text-muted-foreground/70 opacity-70",
                completedBeforeFailure && "border-destructive/15 bg-destructive/5 text-destructive/55 opacity-100",
                active && activeMarkerClass,
              )}
              >
                {completed ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}
              </span>
              <span className={cn(
                "w-full truncate text-[11px] leading-4 text-muted-foreground",
                completed && "text-muted-foreground/55",
                active && "font-medium text-foreground",
                failed && "text-destructive",
              )} title={label}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      {progress.latestEvent !== null ? (
        <p className="min-w-0 truncate text-[11px] text-muted-foreground" title={copy.auditEvent(progress.latestEvent.subject)}>
          {copy.recoveryProgressLatest} · {copy.auditEvent(progress.latestEvent.subject)} · {copy.auditTime(progress.latestEvent.createdAt)}
        </p>
      ) : null}
    </section>
  );
}

function IssueSection({
  children,
  contentClassName,
  title,
}: {
  children: React.ReactNode;
  contentClassName?: string;
  title: string;
}) {
  return (
    <section className="grid min-w-0 gap-4 border-t pt-6" data-slot="issue-section">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className={cn("grid gap-3", contentClassName)}>{children}</div>
    </section>
  );
}
