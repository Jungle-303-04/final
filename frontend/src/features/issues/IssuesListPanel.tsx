import {
  Bell,
  BrainCircuit,
  Check,
  CircleCheckBig,
  CircleDot,
  Clock3,
  Cuboid,
  MapPin,
} from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { serializeRouteSearch } from "../filters/routeSearchAdapter";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button, buttonVariants } from "../../shared/ui/primitives/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../shared/ui/primitives/select";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../shared/ui/primitives/tooltip";
import type { IssueList, IssueSummary } from "./issuesContract";
import { IssueStatusMark } from "./IssueStatusMark";
import {
  isResolvedIssue,
  issueEvidenceCount,
  issueSeverityTone,
  issueStatusTone,
  issueTitle,
} from "./issuePresentation";
import type { IssuesSurfaceCopy, SectionState } from "./issuesSurfaceContract";

export function IssuesListPanel({
  copy,
  detailRegionId,
  list,
  onSelect,
  selected,
}: {
  copy: IssuesSurfaceCopy;
  detailRegionId: string;
  list: SectionState<IssueList>;
  onSelect: (issue: IssueSummary) => void;
  selected: IssueSummary | null;
}) {
  const [activeState, setActiveState] = useState<"open" | "closed">("open");
  const [severityFilter, setSeverityFilter] = useState<IssueSeverityFilter>("all");

  if (list.data === null && list.loading) {
    return (
      <div className="grid gap-2 py-3" role="status">
        <span className="sr-only">{copy.listLoading}</span>
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (list.data === null && list.failure) {
    return (
      <div className="grid gap-1 py-4 text-sm text-destructive" role="alert">
        <span>{copy.genericFailure}</span>
        <span>{copy.failureDetail(list.failure.code)}</span>
      </div>
    );
  }
  if (list.data === null || list.data.items.length === 0) {
    const visibilityState = list.data?.visibility?.state ?? "unknown";
    if (visibilityState === "partial" || visibilityState === "restricted") {
      return <VisibilityNotice copy={copy} state={visibilityState} />;
    }
    const scope = list.data?.clusterId;
    const suffix = scope ? `?clusters=${encodeURIComponent(scope)}` : "";
    return (
      <div className="mx-auto grid max-w-md justify-items-center gap-2 px-4 py-12 text-center" role="status">
        <span className="grid size-10 place-items-center rounded-full bg-status-healthy/10 text-status-healthy">
          <CircleCheckBig aria-hidden="true" className="size-5" />
        </span>
        <p className="text-sm font-medium text-foreground">{copy.listEmpty}</p>
        <div className="mt-2 flex items-center gap-2">
          <a className={cn(buttonVariants({ size: "sm", variant: "outline" }), "cursor-pointer")} href={`/resources${suffix}`}>
            <Cuboid aria-hidden="true" />
            {copy.listBrowseResources}
          </a>
          <a className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "cursor-pointer")} href={`/alerts${suffix}`}>
            <Bell aria-hidden="true" />
            {copy.listBrowseAlerts}
          </a>
        </div>
      </div>
    );
  }
  const total = list.data.total ?? list.data.returned;
  const totalMatched = list.data.totalMatched ?? total;
  const visibilityState = list.data.visibility?.state ?? "unknown";
  const openIssues = sortIssuesByUpdatedAt(list.data.items.filter((issue) => !isResolvedIssue(issue.status)));
  const closedIssues = sortIssuesByUpdatedAt(list.data.items.filter((issue) => isResolvedIssue(issue.status)));
  const visibleIssues = activeState === "open" ? openIssues : closedIssues;
  const filteredIssues = filterIssuesBySeverity(visibleIssues, severityFilter);

  return (
    <div className="grid gap-3 py-3">
      <div className="flex min-w-0 items-center gap-4 border-b px-1 pb-2 text-sm">
        <IssueStateTab
          active={activeState === "open"}
          count={openIssues.length}
          icon={<CircleDot aria-hidden="true" className="size-4" />}
          label={copy.lifecycleOpen}
          onClick={() => setActiveState("open")}
        />
        <IssueStateTab
          active={activeState === "closed"}
          count={closedIssues.length}
          icon={<Check aria-hidden="true" className="size-4" />}
          label={copy.lifecycleClosed}
          onClick={() => setActiveState("closed")}
        />
        <Badge variant="secondary">
          {totalMatched > total
            ? copy.listMatchedCount(total, totalMatched)
            : copy.listCount(total)}
        </Badge>
        <IssueSeverityFilterSelect
          copy={copy}
          onValueChange={setSeverityFilter}
          value={severityFilter}
        />
      </div>
      {visibilityState === "partial" || visibilityState === "restricted" ? (
        <VisibilityNotice copy={copy} state={visibilityState} />
      ) : null}
      {list.data.excludedCount > 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {copy.partial(list.data.excludedCount)}
        </p>
      ) : null}
      {list.failure ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="status">
          {copy.genericFailure} {copy.failureDetail(list.failure.code)}
        </p>
      ) : null}
      {filteredIssues.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">
          {copy.listEmpty}
        </p>
      ) : (
      <ul className="divide-y" role="list">
        {filteredIssues.map((issue) => (
          <IssueQueueRow
            copy={copy}
            detailRegionId={detailRegionId}
            issue={issue}
            key={issue.id}
            onSelect={onSelect}
            selected={selected?.id === issue.id}
          />
        ))}
      </ul>
      )}
    </div>
  );
}

type IssueSeverityFilter = "all" | "critical" | "warning" | "healthy" | "unknown";

function IssueSeverityFilterSelect({
  copy,
  onValueChange,
  value,
}: {
  copy: IssuesSurfaceCopy;
  onValueChange: (value: IssueSeverityFilter) => void;
  value: IssueSeverityFilter;
}) {
  return (
    <Select
      onValueChange={(next) => onValueChange(normalizeSeverityFilter(next))}
      value={value}
    >
      <SelectTrigger
        aria-label={copy.severityFilterLabel}
        className="ml-auto cursor-pointer"
        size="sm"
      >
        <SelectValue placeholder={copy.severityFilterLabel} />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        <SelectGroup>
          <SelectItem value="all">{copy.severityFilterAll}</SelectItem>
          <SelectItem value="critical">{copy.severityCritical}</SelectItem>
          <SelectItem value="warning">{copy.severityWarning}</SelectItem>
          <SelectItem value="healthy">{copy.severityHealthy}</SelectItem>
          <SelectItem value="unknown">{copy.valueUnknown}</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function normalizeSeverityFilter(value: string | null): IssueSeverityFilter {
  if (value === "critical" || value === "warning" || value === "healthy" || value === "unknown") {
    return value;
  }
  return "all";
}

function IssueStateTab({
  active,
  count,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "font-semibold text-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span>{label}</span>
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

function IssueQueueRow({
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
    date: issueCardDate(issue.updatedAt, copy),
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
                      <IssueValuePill href={targetHref}>
                        {target}
                      </IssueValuePill>
                      {scope !== null ? (
                        <>
                          <span className="text-border">·</span>
                          <IssueValuePill href={scopeHref}>
                            {scope}
                          </IssueValuePill>
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

function VisibilityNotice({
  copy,
  state,
}: {
  copy: IssuesSurfaceCopy;
  state: "partial" | "restricted";
}) {
  return (
    <p
      aria-label={copy.visibilityLabel}
      className="rounded-lg border border-status-warning/30 bg-status-warning/5 px-3 py-2 text-sm text-foreground"
      role="status"
    >
      {state === "restricted" ? copy.visibilityRestricted : copy.visibilityPartial}
    </p>
  );
}
function IssueRecoveryProgressLine({ copy, issue }: { copy: IssuesSurfaceCopy; issue: IssueSummary }) {
  const progress = issueRecoveryProgressSummary(issue);
  if (progress === null) return null;
  return (
    <IssueSummaryLine label={copy.recoveryLabel}>
      <IssueRecoveryProgressBadgeContent
        label={copy.recoveryCardProgress(progress.state)}
        step={progress.step}
        tone={progress.state}
      />
    </IssueSummaryLine>
  );
}

type RecoveryBadgeTone = "active" | "approval" | "completed" | "failed";

function IssueRecoveryProgressBadgeContent({
  label,
  step,
  tone,
}: {
  label: string;
  step: number;
  tone: RecoveryBadgeTone;
}) {
  return (
    <Badge className="h-6 gap-1.5 border-transparent bg-muted/45 px-2 text-sm font-normal text-muted-foreground" variant="outline">
      <span>{label}</span>
      <RecoveryMiniProgress step={step} tone={tone} />
      <span className="tabular-nums">{tone === "completed" ? "✓" : `${step}/5`}</span>
    </Badge>
  );
}

function RecoveryMiniProgress({
  step,
  tone,
}: {
  step: number;
  tone: RecoveryBadgeTone;
}) {
  const activeClassName = cn(
    tone === "failed" && "bg-destructive",
    tone === "completed" && "bg-primary",
    tone === "approval" && "bg-status-warning",
    tone === "active" && "bg-primary",
  );
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, index) => {
        const filled = index < step;
        return (
          <span
            className={cn(
              "block h-1.5 w-2 rounded-full bg-muted-foreground/15 transition-[background-color,opacity,transform] duration-(--motion-draw) ease-(--ease-draw) motion-reduce:transition-none",
              filled && activeClassName,
              filled ? "scale-100 opacity-100" : "scale-90 opacity-45",
            )}
            key={index}
          />
        );
      })}
    </span>
  );
}

function IssueSeverityMeter({ tone }: { tone: ReturnType<typeof issueStatusTone> }) {
  const activeClassName = cn(
    tone === "healthy" && "bg-status-healthy",
    tone === "warning" && "bg-status-warning",
    tone === "critical" && "bg-destructive",
    tone === "unknown" && "bg-muted-foreground/50",
  );
  return (
    <span
      aria-hidden="true"
      className="flex h-[1.1em] shrink-0 items-center"
    >
      <span className={cn("block h-[18px] w-[9px] rounded-full", activeClassName)} />
    </span>
  );
}

function severityMeterTooltip(tone: ReturnType<typeof issueStatusTone>, copy: IssuesSurfaceCopy): string {
  if (tone === "healthy") return copy.severityTooltip(copy.severityHealthy);
  if (tone === "warning") return copy.severityTooltip(copy.severityWarning);
  if (tone === "critical") return copy.severityTooltip(copy.severityCritical);
  return copy.severityTooltip(copy.valueUnknown);
}

function issueRecoveryProgressSummary(issue: IssueSummary): { state: RecoveryBadgeTone; step: number } | null {
  const status = normalizeRecoverySignal(issue.status);
  const subject = normalizeRecoverySignal(issue.currentSubject);
  if (
    status === "command_rejected" ||
    status === "pr_failed" ||
    subject === "command.rejected" ||
    subject === "safe_pr.failed" ||
    subject === "workflow.failed"
  ) {
    return { state: "failed", step: 3 };
  }
  if (
    status === "incident_resolved" ||
    status === "resolved" ||
    subject === "incident.resolved"
  ) {
    return { state: "completed", step: 5 };
  }
  if (
    [
      "command_completed",
      "pr_requested",
      "pr_patch_prepared",
      "pr_diff_explained",
      "pr_ready_for_creation",
      "pr_created",
    ].includes(status) ||
    [
      "command.completed",
      "safe_pr.requested",
      "safe_pr.patch_prepared",
      "safe_pr.ready_for_creation",
      "safe_pr.created",
    ].includes(subject)
  ) {
    return { state: "active", step: 4 };
  }
  if (
    ["command_requested", "command_dispatched", "command_queued"].includes(status) ||
    ["command.requested", "command.dispatched", "command.queued_for_agent"].includes(subject)
  ) {
    return { state: "active", step: 3 };
  }
  if (
    issue.commandId !== null ||
    issue.pullRequestUrl !== null ||
    subject === "recovery.action_selected" ||
    status.includes("selected")
  ) {
    return { state: "active", step: 2 };
  }
  if (!isResolvedIssue(issue.status)) {
    return { state: "approval", step: 1 };
  }
  return null;
}

function normalizeRecoverySignal(value: string): string {
  return value.trim().toLowerCase();
}

function sortIssuesByUpdatedAt(issues: readonly IssueSummary[]): IssueSummary[] {
  return issues
    .map((issue, index) => ({
      issue,
      index,
      risk: issueRiskRank(issue),
      time: issueTime(issue.updatedAt),
    }))
    .sort((left, right) => {
      if (left.time !== right.time) return right.time - left.time;
      if (left.risk !== right.risk) return left.risk - right.risk;
      return left.index - right.index;
    })
    .map(({ issue }) => issue);
}

function filterIssuesBySeverity(
  issues: readonly IssueSummary[],
  filter: IssueSeverityFilter,
): IssueSummary[] {
  if (filter === "all") return [...issues];
  return issues.filter((issue) => issueSeverityFilterValue(issue) === filter);
}

function issueSeverityFilterValue(issue: IssueSummary): Exclude<IssueSeverityFilter, "all"> {
  const tone = issueSeverityTone(issue.severity) ?? issueStatusTone(issue.status);
  if (tone === "critical") return "critical";
  if (tone === "warning") return "warning";
  if (tone === "healthy") return "healthy";
  return "unknown";
}

function issueRiskRank(issue: IssueSummary): number {
  const severity = issueSeverityFilterValue(issue);
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  if (severity === "healthy") return 2;
  return 3;
}

function issueTime(value: string | null): number {
  if (value === null) return Number.NEGATIVE_INFINITY;
  const time = Date.parse(value);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function issueCardDate(value: string, copy: IssuesSurfaceCopy): string {
  return copy.auditTime(value);
}

function IssueSummaryLine({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
      <span className="shrink-0 text-foreground/70">{label}</span>
      <span aria-hidden="true" className="text-border">|</span>
      {children}
    </span>
  );
}

function IssueValuePill({
  children,
  href,
}: {
  children: ReactNode;
  href: string | null;
}) {
  const interactive = href !== null;
  const className = cn(
    "inline-flex h-6 max-w-full items-center rounded-full bg-muted px-2 py-0 text-muted-foreground transition-[filter,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    interactive && "cursor-pointer hover:brightness-95",
  );
  const open = (event: MouseEvent<HTMLSpanElement>) => {
    if (href === null) return;
    event.preventDefault();
    event.stopPropagation();
    window.location.assign(href);
  };
  const openFromKeyboard = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (href === null || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    event.stopPropagation();
    window.location.assign(href);
  };
  return (
    <span
      aria-label={interactive ? copyIssueLinkLabel(children) : undefined}
      className={className}
      onClick={open}
      onKeyDown={openFromKeyboard}
      role={interactive ? "link" : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

function copyIssueLinkLabel(value: ReactNode): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function namespaceHref(issue: IssueSummary): string | null {
  if (!issue.clusterId || !issue.namespace) return null;
  return `/resources${serializeRouteSearch([
    ["clusters", issue.clusterId],
    ["namespaces", `${issue.clusterId}/${issue.namespace}`],
  ])}`;
}

function resourceHref(issue: IssueSummary): string | null {
  if (!issue.clusterId || !issue.resourceKind || !issue.resourceName) return namespaceHref(issue);
  const namespace = issue.namespace?.trim() || "~";
  return `/resources${serializeRouteSearch([
    ["clusters", issue.clusterId],
    ["resources.types", issue.resourceKind.toLowerCase()],
    ["detail", `${issue.resourceKind}/${namespace}/${issue.resourceName}`],
  ])}`;
}

function crashLoopSymptomText(title: string): string {
  return title.trim().toLowerCase() === "crashloopbackoff"
    ? title
    : title;
}
