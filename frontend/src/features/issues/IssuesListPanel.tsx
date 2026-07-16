import {
  Bell,
  BrainCircuit,
  Check,
  CircleCheckBig,
  Clock3,
  Cuboid,
  GitPullRequest,
  MapPin,
} from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import type { IssueList, IssueSummary } from "./issuesContract";
import {
  isResolvedIssue,
  issueEvidenceCount,
  issueSeverityTone,
  issueStatusTone,
  issueTitle,
  sortIssuesForQueue,
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
          <Button render={<a href={`/resources${suffix}`} />} size="sm" variant="outline">
            <Cuboid aria-hidden="true" />
            {copy.listBrowseResources}
          </Button>
          <Button render={<a href={`/alerts${suffix}`} />} size="sm" variant="ghost">
            <Bell aria-hidden="true" />
            {copy.listBrowseAlerts}
          </Button>
        </div>
      </div>
    );
  }
  const openIssues = sortIssuesForQueue(list.data.items.filter((issue) => !isResolvedIssue(issue.status)));
  const closedIssues = sortIssuesForQueue(list.data.items.filter((issue) => isResolvedIssue(issue.status)));
  const visibleIssues = activeState === "open" ? openIssues : closedIssues;

  return (
    <div className="grid gap-3 py-3">
      <div className="flex min-w-0 items-center gap-4 border-b px-1 pb-2 text-sm">
        <IssueStateTab
          active={activeState === "open"}
          count={openIssues.length}
          icon={<GitPullRequest aria-hidden="true" className="size-4" />}
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
      {visibleIssues.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">
          {copy.listEmpty}
        </p>
      ) : (
      <ul className="grid gap-2" role="list">
        {visibleIssues.map((issue) => (
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
        "inline-flex min-h-8 items-center gap-2 rounded-md px-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
  const updatedAt = issue.updatedAt === null ? null : copy.auditTime(issue.updatedAt);
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
          "group/issue relative h-auto w-full min-w-0 animate-in fade-in-0 items-stretch justify-start overflow-hidden whitespace-normal rounded-xl border border-border/80 bg-card p-0 text-left shadow-xs transition-[transform,border-color,box-shadow,background-color,opacity] duration-150 ease-out hover:-translate-y-px hover:border-foreground/20 hover:bg-card hover:shadow-sm motion-reduce:animate-none motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          selected && "border-primary/50 bg-primary/[0.035] shadow-md ring-1 ring-primary/20",
          resolved && !selected && "opacity-65 hover:opacity-100",
        )}
        onClick={() => onSelect(issue)}
        type="button"
        variant="ghost"
      >
        <span
          aria-hidden="true"
          className={cn(
            "w-1 shrink-0 bg-status-unknown",
            sideTone === "healthy" && "bg-[#3D45AA] dark:bg-[#5862FF]",
            sideTone === "warning" && "bg-[#FEB05D] dark:bg-[#FFC078]",
            sideTone === "critical" && "bg-[#DA3D20] dark:bg-[#F04424]",
          )}
        />
        <span className="grid min-w-0 flex-1 gap-3 px-4 pb-4 pt-3">
          <span className="flex min-w-0 items-start gap-3">
            <span className="grid min-w-0 flex-1 gap-2">
              <span className="flex min-w-0 items-start justify-between gap-3">
                <span className="break-words text-base font-semibold leading-snug text-foreground">
                  {title}
                </span>
                {updatedAt !== null ? (
                  <time
                    className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-[12px] tabular-nums text-muted-foreground"
                    dateTime={issue.updatedAt ?? undefined}
                    title={copy.updated}
                  >
                    <Clock3 aria-hidden="true" className="size-3" />
                    {updatedAt}
                  </time>
                ) : null}
              </span>
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
                  </IssueSummaryLine>
                ) : null}
                {scope !== null ? (
                  <IssueSummaryLine label={copy.scope}>
                    <IssueValuePill href={scopeHref} variant="scope">
                      {scope}
                    </IssueValuePill>
                    <span className="text-foreground/80">{copy.namespaceSuffix}</span>
                  </IssueSummaryLine>
                ) : null}
              </span>
            </span>
          </span>

          <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted-foreground">
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
                  className="border-[#FFC078] bg-[#FFF3E4] text-[#9A4F10] dark:border-[#FFC078] dark:bg-[#FFC078]/15 dark:text-[#FFC078]"
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
            <Badge
              className={cn(
                "h-7 cursor-pointer rounded-md border-transparent px-2.5",
                resolved
                  ? "border-foreground bg-white text-foreground dark:border-foreground dark:bg-background"
                  : "bg-[#25343F] text-white dark:bg-[#3A5162]",
              )}
              variant="secondary"
            >
              {lifecycleLabel}
            </Badge>
          </span>
        </span>
      </Button>
    </li>
  );
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
    "inline-flex max-w-full items-center rounded-full px-1.5 py-0 text-muted-foreground transition-[filter,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    variant === "scope" && "bg-[#EAEFEF]",
    variant === "target" && "bg-[#E1E8EA]",
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
