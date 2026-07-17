import {
  BrainCircuit,
  ChevronsLeft,
  ChevronsRight,
  CircleCheck,
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../shared/ui/primitives/card";
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
  const [activeTab, setActiveTab] = useState("overview");
  const auditCount = state.audit.data?.items.length ?? null;
  const confidence = selected.confidence === null
    ? null
    : `${Math.round(selected.confidence * 100)}%`;
  const contextMeta = [
    { label: "클러스터", value: selected.clusterId },
    { label: "네임스페이스", value: selected.namespace },
    { label: "종류", value: selected.resourceKind },
    { label: "대상", value: selected.resourceName },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value?.trim()));
  const contextTitle = contextMeta.map(({ label, value }) => `${label} ${value}`).join(" | ");

  return (
    <div
      aria-label={copy.detailLabel}
      className="min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 forced-colors:focus-visible:outline-2 lg:min-h-96"
      id={detailRegionId}
      ref={detailRegionRef}
      role="region"
      tabIndex={-1}
    >
      <Card className="min-w-0 lg:max-h-[calc(100vh-10rem)]">
        <CardHeader className="sticky top-0 z-20 flex flex-row items-start gap-3 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
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
              <CardTitle className="min-w-0 break-words">
                {issueTitle(selected)}
              </CardTitle>
              <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <span aria-hidden="true" className="size-2.5 rounded-full bg-[#5358E0]" />
                원인 분석 완료
              </span>
              {confidence !== null ? (
                <Badge variant="outline">
                  <BrainCircuit aria-hidden="true" />
                  {confidence}
                </Badge>
              ) : null}
            </div>
            {contextMeta.length > 0 ? (
              <p className="mt-1 truncate text-xs text-muted-foreground" title={contextTitle}>
                {contextTitle}
              </p>
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
        </CardHeader>
        <CardContent className="min-w-0 lg:overflow-y-auto">
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
              <TabsTrigger className="cursor-pointer" value="recovery">복구 플랜</TabsTrigger>
              <TabsTrigger className="cursor-pointer" value="timeline">
                {copy.auditLabel}
                {auditCount !== null ? (
                  <Badge variant="secondary">{copy.listCount(auditCount)}</Badge>
                ) : null}
              </TabsTrigger>
            </TabsList>

            <TabsContent className="grid min-w-0 gap-4 py-4" value="overview">
              <IssueOverview copy={copy} selected={selected} state={state.detail} />
              <IssueRecentChangesPanel copy={copy} state={state.recentChanges} />
              <ReportsPanel copy={copy} onOpenRecovery={() => setActiveTab("recovery")} state={state.reports} />
            </TabsContent>

            <TabsContent className="grid min-w-0 gap-4 py-4" value="recovery">
              <RecoveryPanel
                capability={capability}
                copy={copy}
                onSelect={onSelectRecovery}
                receipt={state.receipt}
                selected={selected}
                selectionFailure={state.selectionFailure}
                selectionPendingId={state.selectionPendingId}
                state={state.recovery}
                audit={state.audit.data}
              />
            </TabsContent>

            <TabsContent className="grid min-w-0 gap-4 py-4" value="timeline">
              <IssueAuditTimelinePanel
                copy={copy}
                onLoadMore={onLoadMoreAudit}
                state={state.audit}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function IssueOverview({
  copy,
  selected,
  state,
}: {
  copy: IssuesSurfaceCopy;
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
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b bg-muted/45 p-4">
        <CardTitle>상황 요약</CardTitle>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4 p-4">
        <div className="grid min-w-0 gap-3">
        <p className="break-words text-sm leading-relaxed text-foreground">
          {issueSituationSummary(selected, copy, resolved)}
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
          <Badge variant={resolved ? "secondary" : "outline"}>{resolved ? copy.lifecycleClosed : copy.statusLabel(selected.status)}</Badge>
          {confidence !== null ? (
            <Badge variant="outline">{copy.confidence} {confidence}</Badge>
          ) : null}
          {supportingCount !== null ? (
            <Badge variant="outline">{copy.supportingEvidence} {supportingCount}</Badge>
          ) : null}
        </div>
      </div>
      {missingCount > 0 ? (
        <section className="grid min-w-0 gap-2 rounded-lg border border-[#FFD1AD] bg-[#FFF7F0] p-3 dark:border-[#FF9B51]/45 dark:bg-[#FF9B51]/12">
          <h3 className="flex items-center gap-2 text-xs font-medium text-[#FF9B51] dark:text-[#FFB176]">
            <ShieldAlert aria-hidden="true" className="size-4" />
            {copy.missingEvidence}
          </h3>
          <ul className="grid gap-1.5 text-xs text-muted-foreground">
            {missingEvidence.map((item, index) => (
              <li className="break-words" key={`${item}:${index}`}>• {humanizeFilterValue(item)}</li>
            ))}
          </ul>
        </section>
      ) : null}
      </CardContent>
    </Card>
  );
}

function issueSituationSummary(
  selected: IssuesPanelsProps["selected"],
  copy: IssuesSurfaceCopy,
  resolved: boolean,
): string {
  const symptom = selected.symptom?.trim() || issueTitle(selected);
  const cause = selected.rootCause ? copy.causeLabel(selected.rootCause) : null;
  const situation = symptom.trim().toLowerCase() === "crashloopbackoff"
    ? "컨테이너가 반복적으로 종료되어 CrashLoopBackOff가 발생했습니다."
    : `${humanizeFilterValue(symptom)} 상태가 감지되었습니다.`;
  const causePrefix = cause ? `${cause}로 ` : "";
  const status = resolved ? "현재는 닫힌 상태이며" : `현재는 ${copy.statusLabel(selected.status)} 상태이며`;
  return `${causePrefix}${situation} ${status}, 확인된 근거를 기준으로 요약했습니다.`;
}

function actionSummaryLabel(
  selected: IssuesPanelsProps["selected"],
  copy: IssuesSurfaceCopy,
  resolved: boolean,
): string {
  if (resolved) return "추가 조치 없음";
  if (
    selected.errorReason !== null ||
    ["command_rejected", "pr_failed"].includes(selected.status.trim().toLowerCase())
  ) {
    return copy.actionReviewAgainRequired;
  }
  if (selected.missingEvidence !== null && selected.missingEvidence.length > 0) {
    return copy.missingEvidence;
  }
  if (selected.actionRoute === "auto" || selected.actionRoute === "auto_approve") {
    return copy.actionAutoApprovalAvailable;
  }
  return copy.actionReviewRequired;
}

function EvidencePanel({
  copy,
  state,
}: {
  copy: IssuesSurfaceCopy;
  state: SectionState<IssueEvidencePage>;
}) {
  return (
    <SectionCard title={copy.evidenceLabel}>
      <IssueSectionFrame copy={copy} state={state} unavailable={copy.evidenceUnavailable}>
        {(page) => page.items.length === 0 ? (
          <IssueEmpty text={copy.sectionEmpty} />
        ) : (
          <ul className="grid gap-3">
            {page.items.map((record) => (
              <li className="grid min-w-0 gap-3 rounded-xl border bg-muted/15 p-3" key={record.id}>
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
                <ul className="grid gap-2 text-sm text-muted-foreground">
                  {record.sources.map((source, index) => (
                    <li className="grid min-w-0 gap-1 rounded-lg border bg-card p-2.5" key={`${source.source}:${index}`}>
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
    </SectionCard>
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
    <SectionCard title={copy.reportsLabel}>
      <IssueSectionFrame copy={copy} state={state} unavailable={copy.reportsUnavailable}>
        {(page) => page.items.length === 0 ? (
          <IssueEmpty text={copy.reportsEmpty} />
        ) : (
          <ul className="grid gap-6">
            {page.items.map((report) => (
              <li className="grid min-w-0 gap-5" key={report.id}>
                <ReportMetaHeader copy={copy} report={report} />

                <dl className="grid min-w-0 gap-2 border-b border-dashed pb-4">
                  {report.symptom ? (
                    <ReportLine label={copy.symptom} value={humanizeFilterValue(report.symptom)} />
                  ) : null}
                  {[report.namespace, report.resourceKind, report.resourceName].some(Boolean) ? (
                    <ReportLine
                      label="영향 범위"
                      value={[report.namespace, report.resourceKind, report.resourceName].filter(Boolean).join(" | ")}
                    />
                  ) : null}
                </dl>

                <ReportNumberedSection
                  body={finalJudgementLabel(report, copy)}
                  number="01"
                  title="최종 판단"
                />
                <ReportNumberedSection number="02" title="최종 원인">
                  <div className="grid min-w-0 gap-3">
                    <ReportCandidateAccordion copy={copy} report={report} />
                  </div>
                </ReportNumberedSection>
                <ReportNumberedSection number="03" title="근거 요약">
                  <ReportEvidenceSummary copy={copy} report={report} />
                </ReportNumberedSection>
                <ReportNumberedSection number="04" title="근거 상세">
                  <ReportSelectedEvidenceDetails copy={copy} report={report} />
                </ReportNumberedSection>
                <ReportNumberedSection number="05" title="권장 조치">
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
                      복구 조치 보기
                    </Button>
                  </div>
                </ReportNumberedSection>
              </li>
            ))}
          </ul>
        )}
      </IssueSectionFrame>
    </SectionCard>
  );
}

type RcaReportItem = IssueRcaReportPage["items"][number];

function ReportMetaHeader({ copy, report }: { copy: IssuesSurfaceCopy; report: RcaReportItem }) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-dashed pb-4">
      <ReportMeta label="조치 위험도" value={actionRiskLabel(report.severity)} />
      <ReportMeta
        label={copy.confidence}
        value={report.confidence === null ? "미확인" : `${Math.round(report.confidence * 100)}%`}
      />
      <ReportMeta
        label="시간"
        value={report.createdAt ? compactReportTime(report.createdAt, copy) : "미확인"}
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
  number,
  title,
}: {
  body?: string;
  children?: React.ReactNode;
  number: string;
  title: string;
}) {
  return (
    <section className="grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] gap-3 border-b border-dashed pb-5 last:border-b-0 last:pb-0">
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
    ? report.supportingEvidenceRefs.map((evidence) => evidenceDisplayName(evidence.source, evidence.name))
    : report.supportingEvidence.map(evidenceDisplayNameFromToken);
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
      <section className="grid min-w-0 gap-2 bg-[#F7F8F8] p-3 dark:bg-white/5">
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
          필요한 근거 {selectedSupportingCount + selectedMissingCount}개 중 {selectedSupportingCount}개가 확인되었습니다.
        </p>
        {selectedCandidate.supportingEvidence.length > 0 ? (
          <EvidenceTokenList
            items={selectedCandidate.supportingEvidence}
            label={copy.supportingEvidence}
            tone="healthy"
          />
        ) : null}
        {selectedCandidate.missingEvidence.length > 0 ? (
          <EvidenceTokenList
            items={selectedCandidate.missingEvidence}
            label={copy.missingEvidence}
            tone="warning"
          />
        ) : null}
      </section>
      {candidateOptions.length > 0 ? (
        <section className="grid min-w-0 gap-2">
          <h5 className="text-xs font-medium text-muted-foreground">원인 후보</h5>
          <div className="grid border-y border-dashed">
            {candidateOptions.map((candidate) => {
        const supportingCount = candidate.supportingEvidence.length;
        const missingCount = candidate.missingEvidence.length;
        return (
          <details
            className="group border-b border-dashed last:border-b-0 open:bg-[#F7F8F8] dark:open:bg-white/5"
            key={candidate.id}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1 truncate text-sm font-medium" title={candidate.title ?? candidate.id}>
                {candidate.title ?? humanizeFilterValue(candidate.id)}
              </span>
              {candidate.score !== null ? (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {Math.round(candidate.score * 100)}%
                </span>
              ) : null}
              <Sparkle
                aria-hidden="true"
                className="size-3.5 shrink-0 text-muted-foreground transition-colors group-open:text-[#25343F] dark:group-open:text-[#EAEFEF]"
                fill="currentColor"
                strokeWidth={1.8}
              />
            </summary>
            <div className="grid gap-2 border-t px-3 py-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                필요한 근거 {supportingCount + missingCount}개 중 {supportingCount}개가 확인되었습니다.
              </p>
              {candidate.reason ? (
                <p className="break-words text-xs leading-relaxed text-muted-foreground">{candidate.reason}</p>
              ) : null}
              {candidate.supportingEvidence.length > 0 ? (
                <EvidenceTokenList
                  items={candidate.supportingEvidence}
                  label={copy.supportingEvidence}
                  tone="healthy"
                />
              ) : null}
              {candidate.missingEvidence.length > 0 ? (
                <EvidenceTokenList
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
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 py-2"
            key={`${evidence.source}:${evidence.name}:${index}`}
          >
            <Badge className="max-w-36 truncate" title={evidence.source} variant="secondary">
              {evidenceSourceDisplayName(evidence.source)}
            </Badge>
            <div className="grid min-w-0 gap-1">
              <span className="truncate text-sm font-medium" title={evidence.name}>
                {evidenceNameDisplayName(evidence.name)}
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
      items={fallback}
      label={copy.supportingEvidence}
      tone="healthy"
    />
  );
}

function EvidenceTokenList({
  items,
  label,
  tone,
}: {
  items: readonly string[];
  label: string;
  tone: "healthy" | "warning";
}) {
  return (
    <section className="grid gap-1">
      <h5 className={cn(
        "text-xs font-medium",
        tone === "healthy" ? "text-status-healthy" : "text-[#FF9B51] dark:text-[#FFB176]",
      )}
      >
        {label}
      </h5>
      <p className="break-words text-xs leading-relaxed text-muted-foreground">
        {items.map(evidenceDisplayNameFromToken).join(" · ")}
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
  const symptom = report.symptom ? humanizeFilterValue(report.symptom) : "이슈";
  return `${cause}로 ${symptom}가 발생한 것으로 판단했습니다.`;
}

function recommendedActionLabel(report: RcaReportItem, copy: IssuesSurfaceCopy): string {
  if (report.action === "plan_recovery") {
    if (report.rootCause === "oom_killed") return "메모리 제한 조정안을 검토하세요.";
    return `${copy.recoveryLabel}을 검토하세요.`;
  }
  return evidenceFallbackLabel(report.action);
}

function actionRiskLabel(severity: string | null): string {
  const normalized = severity?.trim().toLowerCase();
  if (normalized === "critical") return "위험";
  if (normalized === "medium" || normalized === "warning") return "보통";
  if (normalized === "low" || normalized === "info") return "낮음";
  return "미확인";
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

function evidenceDisplayName(source: string, name: string): string {
  const sourceLabel = evidenceSourceDisplayName(source);
  const nameLabel = evidenceNameDisplayName(name);
  if (sourceLabel === nameLabel) return sourceLabel;
  return `${sourceLabel} · ${nameLabel}`;
}

function evidenceDisplayNameFromToken(token: string): string {
  const [source, name] = token.split(":", 2);
  if (!name) return evidenceFallbackLabel(token);
  return evidenceDisplayName(source, name);
}

function evidenceSourceDisplayName(source: string): string {
  const normalized = source.trim().toLowerCase();
  if (normalized === "kubernetes") return "Kubernetes";
  if (normalized === "logs") return "Loki";
  if (normalized === "metrics") return "Metrics";
  if (normalized === "metadata") return "Metadata";
  if (normalized === "signal") return "Signal";
  if (normalized === "traces") return "Traces";
  return humanizeFilterValue(source);
}

function evidenceNameDisplayName(name: string): string {
  const normalized = name.trim().toLowerCase();
  const labels: Record<string, string> = {
    "broken image startup log": "이미지 시작 로그 확인 필요",
    "cluster resource state": "클러스터 리소스 상태",
    "config error log": "설정 오류 로그",
    "current workload snapshots": "현재 워크로드 스냅샷",
    "dependency error log": "의존성 오류 로그",
    "port bind failure signal": "포트 바인딩 실패 신호",
    "related logs": "관련 로그",
    "related traces": "관련 트레이스",
    "startup crash signal": "시작 실패 신호",
    "startup permission denied signal": "시작 권한 오류 신호",
    "telemetry metrics": "사용량 지표",
  };
  return labels[normalized] ?? humanizeFilterValue(name);
}

function ReportNarrative({
  copy,
  narrative,
}: {
  copy: IssuesSurfaceCopy;
  narrative: IssueRcaNarrative;
}) {
  return (
    <article className="grid min-w-0 gap-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
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
      <section className="grid gap-1 rounded-lg border border-status-healthy/30 bg-card p-3">
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
    <section className="grid min-w-0 gap-1.5 rounded-lg border bg-card p-3">
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

function ReportFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card px-3 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium" title={value}>{value}</dd>
    </div>
  );
}

function ReportEvidenceList({
  items,
  label,
  tone,
}: {
  items: readonly string[];
  label: string;
  tone: "healthy" | "warning";
}) {
  return (
    <section className="min-w-0 rounded-lg border bg-card p-3">
      <h4 className={tone === "healthy"
        ? "text-xs font-medium text-status-healthy"
        : "text-xs font-medium text-status-warning"}
      >
        {label} · {items.length}
      </h4>
      <ul className="mt-2 grid gap-1.5 text-xs leading-relaxed">
        {items.map((item, index) => (
          <li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2" key={`${item}:${index}`}>
            <span aria-hidden="true">•</span>
            <span className="break-words" title={item}>{evidenceFallbackLabel(item)}</span>
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
    <SectionCard title={copy.recoveryLabel}>
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
        {(plan) => (
          <div className="grid gap-3">
            <Badge variant="outline">{copy.statusLabel(plan.status)}</Badge>
            {plan.candidates.length === 0 ? <IssueEmpty text={copy.sectionEmpty} /> : (
              <ul className="grid gap-3">
                {plan.candidates.map((candidate) => (
                  <li className="grid min-w-0 gap-3 rounded-xl border bg-muted/15 p-3" key={candidate.id}>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="break-words font-medium">{candidate.title}</span>
                      {candidate.id === plan.recommendedActionId
                        ? <Badge variant="secondary">{copy.recommended}</Badge>
                        : null}
                      {candidate.approvalRequired
                        ? <Badge variant="outline">{copy.approvalRequired}</Badge>
                        : null}
                    </div>
                    <p className="break-words text-sm text-muted-foreground">
                      {candidate.description}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <RecoveryFact label={copy.confidence} value={`${Math.round(candidate.score * 100)}%`} />
                      <RecoveryFact label={copy.status} value={candidate.riskLevel} />
                      <RecoveryFact label={copy.target} value={candidate.blastRadius} />
                    </div>
                    {candidate.validationChecks.length > 0 ? (
                      <ul className="grid gap-1 text-xs text-muted-foreground">
                        {candidate.validationChecks.map((check, index) => (
                          <li className="flex items-start gap-1.5 break-words" key={`${check}:${index}`}>
                            <CircleCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-status-healthy" />
                            {check}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {candidate.rollbackPlan ? (
                      <p className="rounded-lg border bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                        {candidate.rollbackPlan}
                      </p>
                    ) : null}
                    {capability.state === "hidden" ? null : (
                      <Button
                        aria-describedby={capability.state === "disabled"
                          ? `recovery-capability-${candidate.id}`
                          : undefined}
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
                        ) : candidate.title}
                      </Button>
                    )}
                    {capability.state === "disabled" ? (
                      <p
                        className="text-sm text-muted-foreground"
                        id={`recovery-capability-${candidate.id}`}
                      >
                        {capability.reason}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </IssueSectionFrame>
    </SectionCard>
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
  return (
    <section
      aria-live="polite"
      className="grid min-w-0 gap-3 rounded-xl border bg-muted/15 p-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        {progress.phase === "completed" ? (
          <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-status-healthy" />
        ) : progress.phase === "failed" ? (
          <XCircle aria-hidden="true" className="size-4 shrink-0 text-destructive" />
        ) : progress.phase === "approval" ? (
          <ShieldAlert aria-hidden="true" className="size-4 shrink-0 text-status-warning" />
        ) : (
          <Spinner className="size-4 shrink-0" decorative />
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={activeLabel}>
          {activeLabel}
        </p>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {progress.phase === "failed" ? copy.recoveryProgressStopped : `${progress.progress}%`}
        </span>
      </div>
      <Progress
        aria-label={copy.recoveryProgressLabel}
        value={progress.progress}
        valueText={activeLabel}
      />
      <ol className="grid min-w-0 grid-cols-5 gap-1" aria-label={copy.recoveryProgressLabel}>
        {steps.map((label, index) => {
          const completed = progress.phase === "completed" || index < progress.activeStep;
          const active = index === progress.activeStep;
          const failed = progress.phase === "failed" && active;
          return (
            <li className="grid min-w-0 justify-items-center gap-1 text-center" key={label}>
              <span className={cn(
                "grid size-6 place-items-center rounded-full border bg-card text-[10px] font-semibold tabular-nums",
                completed && "border-status-healthy/50 text-status-healthy",
                active && !failed && "border-foreground bg-foreground text-background",
                failed && "border-destructive bg-destructive text-destructive-foreground",
              )}
              >
                {completed ? <CircleCheck aria-hidden="true" className="size-3.5" /> : index + 1}
              </span>
              <span className={cn(
                "w-full truncate text-[10px] leading-4 text-muted-foreground",
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

function RecoveryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card px-2.5 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-xs font-medium" title={value}>{value}</dd>
    </div>
  );
}

function SectionCard({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b bg-muted/45 p-4"><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="grid gap-3 p-4">{children}</CardContent>
    </Card>
  );
}
