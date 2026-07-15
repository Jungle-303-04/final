import {
  Activity,
  BrainCircuit,
  ChevronsLeft,
  ChevronsRight,
  CircleCheck,
  DatabaseZap,
  LoaderCircle,
  ShieldAlert,
  TriangleAlert,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
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
import { IssueAuditTimelinePanel } from "./IssueAuditTimelinePanel";
import { IssueRecentChangesPanel } from "./IssueRecentChangesPanel";
import { IssueEmpty, IssueSectionFrame } from "./IssueSectionFrame";
import {
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
  const evidenceCount = state.evidence.data?.items.length ?? issueEvidenceCount(selected);
  const auditCount = state.audit.data?.items.length ?? null;
  const confidence = selected.confidence === null
    ? null
    : `${Math.round(selected.confidence * 100)}%`;
  const contextPath = [
    selected.clusterId,
    selected.namespace,
    selected.resourceKind,
    selected.resourceName,
  ].filter((value): value is string => Boolean(value?.trim()));

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
              <IssueStatusMark label={selected.status} tone={issueStatusTone(selected.status)} />
              {confidence !== null ? (
                <Badge variant="outline">
                  <BrainCircuit aria-hidden="true" />
                  {confidence}
                </Badge>
              ) : null}
            </div>
            {contextPath.length > 0 ? (
              <p className="mt-1 truncate text-xs text-muted-foreground" title={contextPath.join(" / ")}>
                {contextPath.join(" / ")}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              aria-label={full ? copy.detailCollapse : copy.detailExpand}
              className="hidden lg:inline-flex"
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
          <Tabs defaultValue="overview">
            <TabsList
              aria-label={copy.detailLabel}
              className="sticky top-0 z-10 w-full justify-start overflow-x-auto bg-card py-1"
              variant="line"
            >
              <TabsTrigger value="overview">{copy.detailLabel}</TabsTrigger>
              <TabsTrigger value="evidence">
                {copy.evidenceLabel}
                {evidenceCount !== null ? (
                  <Badge variant="secondary">{copy.listCount(evidenceCount)}</Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="timeline">
                {copy.auditLabel}
                {auditCount !== null ? (
                  <Badge variant="secondary">{copy.listCount(auditCount)}</Badge>
                ) : null}
              </TabsTrigger>
            </TabsList>

            <TabsContent className="grid min-w-0 gap-4 py-4" value="overview">
              <IssueOverview copy={copy} selected={selected} state={state.detail} />
              <IssueRecentChangesPanel copy={copy} state={state.recentChanges} />
              <ReportsPanel copy={copy} state={state.reports} />
              <RecoveryPanel
                capability={capability}
                copy={copy}
                onSelect={onSelectRecovery}
                receipt={state.receipt}
                selectionPendingId={state.selectionPendingId}
                state={state.recovery}
              />
            </TabsContent>

            <TabsContent className="grid min-w-0 gap-4 py-4" value="evidence">
              <EvidencePanel copy={copy} state={state.evidence} />
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
  return (
    <section className="grid min-w-0 gap-4 rounded-xl border bg-muted/15 p-4">
      <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MetricFact
          icon={<Activity aria-hidden="true" />}
          label={copy.status}
          value={selected.status}
        />
        <MetricFact
          icon={<BrainCircuit aria-hidden="true" />}
          label={copy.confidence}
          value={selected.confidence === null ? null : `${Math.round(selected.confidence * 100)}%`}
        />
        <MetricFact
          icon={<DatabaseZap aria-hidden="true" />}
          label={copy.supportingEvidence}
          value={listEvidenceCount === null ? null : copy.listCount(listEvidenceCount)}
        />
        <MetricFact
          icon={<ShieldAlert aria-hidden="true" />}
          label={copy.missingEvidence}
          value={selected.missingEvidence === null
            ? null
            : copy.listCount(selected.missingEvidence.length)}
        />
      </div>
      <IssueSectionFrame copy={copy} state={state} unavailable={copy.genericFailure}>
        {(detail) => (
          <div className="grid min-w-0 gap-4 border-t pt-4">
            {detail.dataQualityWarnings.length > 0 ? (
              <p className="text-sm text-muted-foreground" role="status">
                {copy.partial(detail.dataQualityWarnings.length)}
              </p>
            ) : null}
            {detail.rootCause ? (
              <div className="grid gap-1 rounded-lg border border-status-warning/30 bg-status-warning/5 p-3">
                <p className="flex items-center gap-2 text-xs font-medium text-status-warning">
                  <TriangleAlert aria-hidden="true" className="size-4" />
                  {copy.rootCause}
                </p>
                <p className="break-words text-sm leading-relaxed">{detail.rootCause}</p>
              </div>
            ) : null}
            <EvidenceFacts copy={copy} detail={detail} />
          </div>
        )}
      </IssueSectionFrame>
    </section>
  );
}

function MetricFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  if (value === null) return null;
  return (
    <div className="min-w-0 rounded-lg border bg-card px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground [&>svg]:size-3.5">
        {icon}{label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold tabular-nums" title={value}>{value}</dd>
    </div>
  );
}

function EvidenceFacts({
  copy,
  detail,
}: {
  copy: IssuesSurfaceCopy;
  detail: NonNullable<IssuesPanelsProps["state"]["detail"]["data"]>;
}) {
  if (detail.supportingEvidence.length === 0 && detail.missingEvidence.length === 0) return null;
  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
      {detail.supportingEvidence.length > 0 ? (
        <EvidenceFactList
          icon={<CircleCheck aria-hidden="true" className="text-status-healthy" />}
          items={detail.supportingEvidence}
          label={copy.supportingEvidence}
        />
      ) : null}
      {detail.missingEvidence.length > 0 ? (
        <EvidenceFactList
          icon={<ShieldAlert aria-hidden="true" className="text-status-warning" />}
          items={detail.missingEvidence}
          label={copy.missingEvidence}
        />
      ) : null}
    </div>
  );
}

function EvidenceFactList({
  icon,
  items,
  label,
}: {
  icon: React.ReactNode;
  items: readonly string[];
  label: string;
}) {
  return (
    <section className="min-w-0 rounded-lg border bg-card p-3">
      <h3 className="flex items-center gap-2 text-xs font-medium [&>svg]:size-4">{icon}{label}</h3>
      <ul className="mt-2 grid gap-1.5 text-xs text-muted-foreground">
        {items.map((item, index) => <li className="break-words" key={`${item}:${index}`}>• {item}</li>)}
      </ul>
    </section>
  );
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
                <div className="flex min-w-0 flex-wrap items-start gap-2">
                  <p className="min-w-0 flex-1 break-words font-medium">{record.summary}</p>
                  <Badge variant="outline">{record.kind}</Badge>
                </div>
                <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {record.clusterId ? <span className="truncate">{record.clusterId}</span> : null}
                  {record.evidenceRef ? (
                    <span className="max-w-full truncate font-mono" title={record.evidenceRef}>
                      {record.evidenceRef}
                    </span>
                  ) : null}
                  {record.createdAt ? (
                    <time className="tabular-nums" dateTime={record.createdAt}>
                      {copy.auditTime(record.createdAt)}
                    </time>
                  ) : null}
                </div>
                <ul className="grid gap-2 text-sm text-muted-foreground">
                  {record.sources.map((source, index) => (
                    <li className="grid min-w-0 gap-1 rounded-lg border bg-card p-2.5" key={`${source.source}:${index}`}>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge variant="secondary">{source.source}</Badge>
                        {source.collector ? (
                          <span className="truncate font-mono text-[11px]" title={source.collector}>
                            {source.collector}{source.collectorVersion ? `@${source.collectorVersion}` : ""}
                          </span>
                        ) : null}
                      </div>
                      <p className="break-words leading-relaxed">{source.summary}</p>
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
  state,
}: {
  copy: IssuesSurfaceCopy;
  state: SectionState<IssueRcaReportPage>;
}) {
  return (
    <SectionCard title={copy.reportsLabel}>
      <IssueSectionFrame copy={copy} state={state} unavailable={copy.reportsUnavailable}>
        {(page) => page.items.length === 0 ? (
          <IssueEmpty text={copy.sectionEmpty} />
        ) : (
          <ul className="grid gap-3">
            {page.items.map((report) => (
              <li className="grid min-w-0 gap-3 rounded-xl border bg-muted/15 p-3" key={report.id}>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {report.severity ? (
                    <IssueStatusMark label={report.severity} tone={issueStatusTone(report.severity)} />
                  ) : null}
                  {report.confidence !== null ? (
                    <Badge variant="outline">
                      <BrainCircuit aria-hidden="true" />
                      {Math.round(report.confidence * 100)}%
                    </Badge>
                  ) : null}
                  {report.createdAt ? (
                    <time className="ml-auto text-xs tabular-nums text-muted-foreground" dateTime={report.createdAt}>
                      {copy.auditTime(report.createdAt)}
                    </time>
                  ) : null}
                </div>
                <div className="grid gap-1">
                  <p className="text-xs font-medium text-muted-foreground">{copy.rootCause}</p>
                  <p className="break-words font-medium leading-relaxed">{report.rootCause}</p>
                </div>
                <div className="grid gap-1 rounded-lg border border-status-healthy/30 bg-status-healthy/5 p-3">
                  <p className="text-xs font-medium text-status-healthy">{copy.recommended}</p>
                  <p className="break-words text-sm leading-relaxed">{report.action}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {report.supportingEvidence.length > 0 ? (
                    <Badge variant="secondary">
                      {copy.supportingEvidence} {copy.listCount(report.supportingEvidence.length)}
                    </Badge>
                  ) : null}
                  {report.missingEvidence.length > 0 ? (
                    <Badge variant="outline">
                      {copy.missingEvidence} {copy.listCount(report.missingEvidence.length)}
                    </Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </IssueSectionFrame>
    </SectionCard>
  );
}

function RecoveryPanel({
  capability,
  copy,
  onSelect,
  receipt,
  selectionPendingId,
  state,
}: {
  capability: RecoverySelectionCapability;
  copy: IssuesSurfaceCopy;
  onSelect: (actionId: string) => void;
  receipt: { eventId: string } | null;
  selectionPendingId: string | null;
  state: SectionState<IssueRecoveryPlan>;
}) {
  return (
    <SectionCard title={copy.recoveryLabel}>
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
            <Badge variant="outline">{plan.status}</Badge>
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
                        disabled={capability.state === "disabled" || selectionPendingId !== null}
                        onClick={() => onSelect(candidate.id)}
                        type="button"
                      >
                        {selectionPendingId === candidate.id ? (
                          <>
                            <LoaderCircle aria-hidden="true" className="animate-spin" />
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
    <Card>
      <CardHeader className="border-b"><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="grid gap-3">{children}</CardContent>
    </Card>
  );
}
