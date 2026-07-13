import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../shared/ui/primitives/card";
import type {
  IssueEvidencePage,
  IssueRcaReportPage,
  IssueRecoveryPlan,
} from "./issuesContract";
import { IssueAuditTimelinePanel } from "./IssueAuditTimelinePanel";
import { IssueRecentChangesPanel } from "./IssueRecentChangesPanel";
import { IssueEmpty, IssueSectionFrame } from "./IssueSectionFrame";
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
  onLoadMoreAudit,
  onSelectRecovery,
  selected,
  state,
}: IssuesPanelsProps) {
  return (
    <div
      aria-label={copy.detailLabel}
      className="grid gap-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 forced-colors:focus-visible:outline-2 lg:min-h-96"
      id={detailRegionId}
      ref={detailRegionRef}
      role="region"
      tabIndex={-1}
    >
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="break-words">{selected.currentSubject}</CardTitle>
        </CardHeader>
        <CardContent>
          <IssueSectionFrame copy={copy} state={state.detail} unavailable={copy.genericFailure}>
            {(detail) => (
              <div className="grid gap-3">
                {detail.dataQualityWarnings.length > 0 ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {copy.partial(detail.dataQualityWarnings.length)}
                  </p>
                ) : null}
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Fact label={copy.status} value={detail.status} />
                  <Fact label={copy.rootCause} value={detail.rootCause} />
                </dl>
              </div>
            )}
          </IssueSectionFrame>
        </CardContent>
      </Card>
      <IssueRecentChangesPanel copy={copy} state={state.recentChanges} />
      <IssueAuditTimelinePanel
        copy={copy}
        onLoadMore={onLoadMoreAudit}
        state={state.audit}
      />
      <EvidencePanel copy={copy} state={state.evidence} />
      <ReportsPanel copy={copy} state={state.reports} />
      <RecoveryPanel
        capability={capability}
        copy={copy}
        onSelect={onSelectRecovery}
        receipt={state.receipt}
        selectionPendingId={state.selectionPendingId}
        state={state.recovery}
      />
    </div>
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
              <li className="grid gap-2 rounded-lg border p-3" key={record.id}>
                <p className="break-words font-medium">{record.summary}</p>
                <ul className="grid gap-1 text-sm text-muted-foreground">
                  {record.sources.map((source, index) => (
                    <li className="break-words" key={`${source.source}:${index}`}>
                      {source.summary}
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
              <li className="grid gap-2 rounded-lg border p-3" key={report.id}>
                <p className="break-words font-medium">{report.rootCause}</p>
                <p className="break-words text-sm text-muted-foreground">{report.action}</p>
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
      {receipt ? <Alert><AlertDescription>{copy.selectionReceived(receipt.eventId)}</AlertDescription></Alert> : null}
      <IssueSectionFrame copy={copy} state={state} unavailable={copy.recoveryUnavailable}>
        {(plan) => (
          <div className="grid gap-3">
            <Badge variant="outline">{plan.status}</Badge>
            {plan.candidates.length === 0 ? <IssueEmpty text={copy.sectionEmpty} /> : (
              <ul className="grid gap-3">
                {plan.candidates.map((candidate) => (
                  <li className="grid gap-2 rounded-lg border p-3" key={candidate.id}>
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
                    {capability.state === "hidden" ? null : (
                      <Button
                        aria-describedby={capability.state === "disabled"
                          ? `recovery-capability-${candidate.id}`
                          : undefined}
                        disabled={capability.state === "disabled" || selectionPendingId !== null}
                        onClick={() => onSelect(candidate.id)}
                        type="button"
                      >
                        {selectionPendingId === candidate.id
                          ? copy.selectionPending
                          : candidate.title}
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

function SectionCard({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <Card>
      <CardHeader className="border-b"><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="grid gap-3">{children}</CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>;
}
