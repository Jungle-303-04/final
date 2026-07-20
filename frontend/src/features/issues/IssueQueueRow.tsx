import { BrainCircuit, Clock3, MapPin } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../shared/ui/primitives/tooltip";
import type { IssueSummary } from "./issuesContract";
import type { IssuesSurfaceCopy } from "./issuesSurfaceContract";
import { IssueStatusMark } from "./IssueStatusMark";
import {
  isResolvedIssue,
  issueEvidenceCount,
  issueSeverityTone,
  issueStatusTone,
  issueTitle,
} from "./issuePresentation";
import {
  crashLoopSymptomText,
  issueCardDate,
  namespaceHref,
  resourceHref,
} from "./issuesListPresentation";
import {
  IssueRecoveryProgressLine,
  IssueSeverityMeter,
  IssueSummaryLine,
  IssueValuePill,
  severityMeterTooltip,
} from "./IssueQueueRowParts";

export function IssueQueueRow({
  copy,
  detailRegionId,
  issue,
  onSelect,
  selected,
}: {
  copy: IssuesSurfaceCopy;
  detailRegionId: string;
  issue: IssueSummary;
  onSelect: (issue: IssueSummary) => void;
  selected: boolean;
}) {
  const title = issueTitle(issue);
  const evidenceCount = issueEvidenceCount(issue);
  const missingCount = issue.missingEvidence?.length ?? null;
  const resolved = isResolvedIssue(issue.status);
  const tone = issueSeverityTone(issue.severity) ?? issueStatusTone(issue.status);
  const sideTone = resolved ? issueStatusTone(issue.status) : tone;
  const lifecycleLabel = resolved ? copy.lifecycleClosed : copy.lifecycleOpen;
  const needsActionReviewAgain = issue.errorReason !== null ||
    ["command_rejected", "pr_failed"].includes(issue.status.trim().toLowerCase());
  const actionLabel = needsActionReviewAgain
    ? copy.actionReviewAgainRequired
    : issue.actionRoute === "auto" || issue.actionRoute === "auto_approve"
      ? copy.actionAutoApprovalAvailable
      : copy.actionReviewRequired;
  const confidence = issue.confidence === null
    ? null
    : `${Math.round(issue.confidence * 100)}%`;
  const updatedAt = issue.updatedAt === null ? null : {
    date: issueCardDate(issue.updatedAt, copy.auditTime),
    full: copy.auditTime(issue.updatedAt),
  };
  const symptom = issue.symptom?.trim()
    ? crashLoopSymptomText(issue.symptom)
    : copy.statusLabel(issue.status);
  const target = issue.resourceName?.trim() || null;
  const scope = issue.namespace?.trim() || null;
  const targetHref = resourceHref(issue);
  const scopeHref = namespaceHref(issue);

  return (
    <li>
      <Button
        aria-controls={selected ? detailRegionId : undefined}
        aria-current={selected ? "true" : undefined}
        aria-label={title}
        className={cn(
          "@container group/issue relative h-auto w-full min-w-0 animate-in cursor-pointer fade-in-0 items-stretch justify-start overflow-hidden whitespace-normal rounded-none border-0 bg-transparent p-0 text-left transition-[background-color,opacity] duration-(--motion-instant) ease-(--ease-soft) hover:bg-muted/25 motion-reduce:animate-none motion-reduce:transition-none",
          "before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-transparent",
          selected && "bg-muted/35 before:bg-foreground",
          resolved && !selected && "opacity-65 hover:opacity-100",
        )}
        onClick={() => onSelect(issue)}
        type="button"
        variant="ghost"
      >
        <span className="grid min-w-0 flex-1 gap-3 px-4 pb-3 pt-3">
          <span className="flex min-w-0 items-start gap-3 border-b border-dashed pb-3">
            <span className="grid min-w-0 flex-1 gap-2">
              <span className="flex min-w-0 items-start justify-between gap-3">
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Tooltip>
                    <TooltipTrigger render={<span className="inline-flex shrink-0 cursor-help" />}>
                      <IssueSeverityMeter tone={sideTone} />
                    </TooltipTrigger>
                    <TooltipContent side="top">{severityMeterTooltip(sideTone, copy)}</TooltipContent>
                  </Tooltip>
                  <span className="min-w-0 truncate text-base font-semibold leading-snug text-foreground @md:break-words @md:whitespace-normal">
                    {title}
                  </span>
                </span>
                {updatedAt !== null ? (
                  <time
                    className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-[12px] tabular-nums text-muted-foreground"
                    dateTime={issue.updatedAt ?? undefined}
                    title={issue.updatedAt === null ? copy.updated : `${copy.updated} · ${copy.auditTime(issue.updatedAt)}`}
                  >
                    <Clock3 aria-hidden="true" className="size-3" />
                    <span className="hidden @md:inline">{updatedAt.full}</span>
                    <span className="@md:hidden">{updatedAt.date}</span>
                  </time>
                ) : null}
              </span>
              <span className="flex min-w-0 items-start gap-3">
                <span className="grid min-w-0 gap-1.5 text-sm leading-6 text-muted-foreground">
                  <IssueSummaryLine label={copy.symptom}>
                    <span className="text-foreground/80">{symptom}</span>
                  </IssueSummaryLine>
                  {issue.rootCause ? (
                    <IssueSummaryLine label={copy.rootCause}>
                      <span className="text-foreground/80">{copy.causeLabel(issue.rootCause)}</span>
                    </IssueSummaryLine>
                  ) : null}
                  {target !== null ? (
                    <IssueSummaryLine label={copy.target}>
                      <IssueValuePill href={targetHref}>{target}</IssueValuePill>
                      {scope !== null ? (
                        <>
                          <span className="text-border">·</span>
                          <IssueValuePill href={scopeHref}>{scope}</IssueValuePill>
                          <span className="text-foreground/80">{copy.namespaceSuffix}</span>
                        </>
                      ) : null}
                    </IssueSummaryLine>
                  ) : null}
                  <IssueRecoveryProgressLine copy={copy} issue={issue} />
                  {target === null && scope !== null ? (
                    <IssueSummaryLine label={copy.scope}>
                      <IssueValuePill href={scopeHref}>{scope}</IssueValuePill>
                      <span className="text-foreground/80">{copy.namespaceSuffix}</span>
                    </IssueSummaryLine>
                  ) : null}
                </span>
              </span>
            </span>
          </span>

          <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-dashed pb-3 text-[12px] text-muted-foreground">
            {issue.clusterId ? (
              <span className="flex min-w-0 items-center gap-1">
                <MapPin aria-hidden="true" className="size-3 shrink-0" />
                <span className="max-w-40 truncate">{issue.clusterId}</span>
              </span>
            ) : null}
            {confidence !== null ? (
              <span className="flex items-center gap-1" title={copy.confidence}>
                <BrainCircuit aria-hidden="true" className="size-3" />
                <span className="tabular-nums">{confidence}</span>
              </span>
            ) : null}
            {evidenceCount !== null ? (
              <span className="tabular-nums" title={copy.supportingEvidence}>
                {copy.supportingEvidence} {copy.listCount(evidenceCount)}
              </span>
            ) : null}
          </span>
          <span className="flex min-w-0 items-center justify-between gap-2">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              {issue.category ? <Badge variant="outline">{issue.category}</Badge> : null}
              {issue.severity ? (
                <Badge variant={issue.severity === "critical" ? "destructive" : "warning"}>
                  {copy.severityLabel(issue.severity)}
                </Badge>
              ) : null}
              <IssueStatusMark label={copy.statusLabel(issue.status)} tone={issueStatusTone(issue.status)} />
              {!resolved ? (
                <Badge
                  className="border-status-warning/30 bg-status-warning/10 text-foreground/80"
                  variant="outline"
                >
                  {needsActionReviewAgain
                    ? actionLabel
                    : missingCount !== null && missingCount > 0
                      ? `${copy.missingEvidence} ${copy.listCount(missingCount)}`
                      : actionLabel}
                </Badge>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Badge
                className={cn(
                  "h-7 cursor-pointer rounded-md border-transparent px-2.5",
                  "h-8 px-3 text-sm",
                  resolved
                    ? "border-foreground bg-background text-foreground"
                    : "bg-foreground text-background",
                )}
                variant="secondary"
              >
                {lifecycleLabel}
              </Badge>
            </span>
          </span>
        </span>
      </Button>
    </li>
  );
}
