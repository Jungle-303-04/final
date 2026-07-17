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
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
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
    const scope = list.data?.clusterId;
    const suffix = scope ? `?clusters=${encodeURIComponent(scope)}` : "";
    return (
      <div className="mx-auto grid max-w-md justify-items-center gap-2 px-4 py-12 text-center" role="status">
        <span className="grid size-10 place-items-center rounded-full bg-status-healthy/10 text-status-healthy">
          <CircleCheckBig aria-hidden="true" className="size-5" />
        </span>
        <p className="text-sm font-medium text-foreground">{copy.listEmpty}</p>
        <div className="mt-2 flex items-center gap-2">
          <Button className="cursor-pointer" render={<a href={`/resources${suffix}`} />} size="sm" variant="outline">
            <Cuboid aria-hidden="true" />
            {copy.listBrowseResources}
          </Button>
          <Button className="cursor-pointer" render={<a href={`/alerts${suffix}`} />} size="sm" variant="ghost">
            <Bell aria-hidden="true" />
            {copy.listBrowseAlerts}
          </Button>
        </div>
      </div>
    );
  }
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
        <IssueSeverityFilterSelect
          onValueChange={setSeverityFilter}
          value={severityFilter}
        />
      </div>
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
      <ul className="grid gap-2" role="list">
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
  onValueChange,
  value,
}: {
  onValueChange: (value: IssueSeverityFilter) => void;
  value: IssueSeverityFilter;
}) {
  return (
    <Select
      onValueChange={(next) => onValueChange(normalizeSeverityFilter(next))}
      value={value}
    >
      <SelectTrigger
        aria-label="위험도 필터"
        className="ml-auto cursor-pointer"
        size="sm"
      >
        <SelectValue placeholder="위험도" />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        <SelectGroup>
          <SelectItem value="all">전체 위험도</SelectItem>
          <SelectItem value="critical">위험</SelectItem>
          <SelectItem value="warning">경고</SelectItem>
          <SelectItem value="healthy">정상</SelectItem>
          <SelectItem value="unknown">미확인</SelectItem>
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
          "@container group/issue relative h-auto w-full min-w-0 animate-in cursor-pointer fade-in-0 items-stretch justify-start overflow-hidden whitespace-normal rounded-xl border border-border/80 bg-card p-0 text-left shadow-xs transition-[transform,border-color,box-shadow,background-color,opacity] duration-150 ease-out hover:-translate-y-px hover:border-foreground/20 hover:bg-card hover:shadow-sm motion-reduce:animate-none motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          selected && "border-foreground/15 bg-[#FBFBFB] shadow-md ring-1 ring-foreground/10 dark:bg-white/5",
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
                    <TooltipContent side="top">{severityMeterTooltip(sideTone)}</TooltipContent>
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
                      <IssueValuePill href={targetHref} variant="target">
                        {target}
                      </IssueValuePill>
                      {scope !== null ? (
                        <>
                          <span className="text-border">·</span>
                          <IssueValuePill href={scopeHref} variant="scope">
                            {scope}
                          </IssueValuePill>
                          <span className="text-foreground/80">{copy.namespaceSuffix}</span>
                        </>
                      ) : null}
                    </IssueSummaryLine>
                  ) : null}
                  <IssueRecoveryProgressLine issue={issue} />
                  {target === null && scope !== null ? (
                    <IssueSummaryLine label={copy.scope}>
                      <IssueValuePill href={scopeHref} variant="scope">{scope}</IssueValuePill>
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
              {!resolved ? (
                <Badge
                  className="border-[#FFE2CC] bg-[#FFF9F4] text-foreground/80 dark:border-[#FF9B51]/25 dark:bg-[#FF9B51]/8 dark:text-foreground/80"
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
                    ? "border-foreground bg-white text-foreground dark:border-foreground dark:bg-background"
                    : "bg-black text-white dark:bg-white dark:text-black",
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

function IssueRecoveryProgressBadge({ issue }: { issue: IssueSummary }) {
  const progress = issueRecoveryProgressSummary(issue);
  if (progress === null) return null;
  const tone = progress.label === "복구 실패"
    ? "failed"
    : progress.label === "복구 완료"
      ? "completed"
      : progress.label === "복구 대기"
        ? "approval"
      : "active";
  return <IssueRecoveryProgressBadgeContent label={progress.label} step={progress.step} tone={tone} />;
}

function IssueRecoveryProgressLine({ issue }: { issue: IssueSummary }) {
  const progress = issueRecoveryProgressSummary(issue);
  if (progress === null) return null;
  const tone = progress.label === "복구 실패"
    ? "failed"
    : progress.label === "복구 완료"
      ? "completed"
      : progress.label === "복구 대기"
        ? "approval"
      : "active";
  return (
    <IssueSummaryLine label="복구">
      <IssueRecoveryProgressBadgeContent label={progress.label} step={progress.step} tone={tone} />
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
    <Badge className="h-6 gap-1.5 border-transparent bg-[#F7F8F8] px-2 text-sm font-normal text-muted-foreground dark:bg-white/5" variant="outline">
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
    tone === "failed" && "bg-[#F74720]",
    tone === "completed" && "bg-[#5358E0]",
    tone === "approval" && "bg-[#FF9B51]",
    tone === "active" && "bg-[#5358E0]",
  );
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, index) => {
        const filled = index < step;
        return (
          <span
            className={cn(
              "block h-1.5 w-2 rounded-full bg-muted-foreground/15 transition-[background-color,opacity,transform] duration-1000 ease-out motion-reduce:transition-none",
              filled && activeClassName,
              filled ? "scale-100 opacity-100" : "scale-90 opacity-45",
            )}
            key={index}
            style={filled ? { transitionDelay: `${index * 120}ms` } : undefined}
          />
        );
      })}
    </span>
  );
}

function IssueSeverityMeter({ tone }: { tone: ReturnType<typeof issueStatusTone> }) {
  const activeClassName = cn(
    tone === "healthy" && "bg-[#5358E0] shadow-[0_0_7px_rgba(83,88,224,0.45)]",
    tone === "warning" && "bg-[#FFF97D] shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_0_9px_rgba(255,249,125,0.78),0_0_14px_rgba(255,249,125,0.35)]",
    tone === "critical" && "bg-[#F74720] shadow-[0_0_8px_rgba(247,71,32,0.55)]",
    tone === "unknown" && "bg-muted-foreground/50 shadow-[0_0_6px_rgba(0,0,0,0.18)]",
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

function severityMeterTooltip(tone: ReturnType<typeof issueStatusTone>): string {
  if (tone === "healthy") return "심각도: 정상";
  if (tone === "warning") return "심각도: 경고";
  if (tone === "critical") return "심각도: 위험";
  return "심각도: 미확인";
}

function issueRecoveryProgressSummary(issue: IssueSummary): { label: string; step: number } | null {
  const status = normalizeRecoverySignal(issue.status);
  const subject = normalizeRecoverySignal(issue.currentSubject);
  if (
    status === "command_rejected" ||
    status === "pr_failed" ||
    subject === "command.rejected" ||
    subject === "safe_pr.failed" ||
    subject === "workflow.failed"
  ) {
    return { label: "복구 실패", step: 3 };
  }
  if (
    status === "incident_resolved" ||
    status === "resolved" ||
    subject === "incident.resolved"
  ) {
    return { label: "복구 완료", step: 5 };
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
    return { label: "검증 중", step: 4 };
  }
  if (
    ["command_requested", "command_dispatched", "command_queued"].includes(status) ||
    ["command.requested", "command.dispatched", "command.queued_for_agent"].includes(subject)
  ) {
    return { label: "복구 실행 중", step: 3 };
  }
  if (
    issue.commandId !== null ||
    issue.pullRequestUrl !== null ||
    subject === "recovery.action_selected" ||
    status.includes("selected")
  ) {
    return { label: "복구 요청됨", step: 2 };
  }
  if (!isResolvedIssue(issue.status)) {
    return { label: "복구 대기", step: 1 };
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return copy.auditTime(value);
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
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
  variant,
}: {
  children: ReactNode;
  href: string | null;
  variant: "scope" | "target";
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
      aria-label={interactive ? `${children} 이동` : undefined}
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

function namespaceHref(issue: IssueSummary): string | null {
  if (!issue.clusterId || !issue.namespace) return null;
  const params = new URLSearchParams();
  params.set("clusters", issue.clusterId);
  params.set("namespaces", `${issue.clusterId}/${issue.namespace}`);
  return `/resources?${params.toString()}`;
}

function resourceHref(issue: IssueSummary): string | null {
  if (!issue.clusterId || !issue.resourceKind || !issue.resourceName) return namespaceHref(issue);
  const params = new URLSearchParams();
  const namespace = issue.namespace?.trim() || "~";
  params.set("clusters", issue.clusterId);
  params.set("resources.types", issue.resourceKind.toLowerCase());
  params.set("detail", `${issue.resourceKind}/${namespace}/${issue.resourceName}`);
  return `/resources?${params.toString()}`;
}

function crashLoopSymptomText(title: string): string {
  return title.trim().toLowerCase() === "crashloopbackoff"
    ? "컨테이너가 반복적으로 종료되어 Kubernetes가 재시작을 지연하고 있습니다."
    : title;
}
