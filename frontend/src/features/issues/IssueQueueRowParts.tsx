import { cn } from "@/shared/lib/cn";
import { type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Badge } from "../../shared/ui/primitives/badge";
import type { IssueSummary } from "./issuesContract";
import type { IssuesSurfaceCopy } from "./issuesSurfaceContract";
import { issueStatusTone } from "./issuePresentation";
import {
  issueRecoveryProgressSummary,
  type RecoveryBadgeTone,
} from "./issuesListPresentation";

export function IssueRecoveryProgressLine({
  copy,
  issue,
}: {
  copy: IssuesSurfaceCopy;
  issue: IssueSummary;
}) {
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

export function IssueSeverityMeter({
  tone,
}: {
  tone: ReturnType<typeof issueStatusTone>;
}) {
  const activeClassName = cn(
    tone === "healthy" && "bg-status-healthy",
    tone === "warning" && "bg-status-warning",
    tone === "critical" && "bg-destructive",
    tone === "unknown" && "bg-muted-foreground/50",
  );
  return (
    <span aria-hidden="true" className="flex h-[1.1em] shrink-0 items-center">
      <span className={cn("block h-[18px] w-[9px] rounded-full", activeClassName)} />
    </span>
  );
}

export function severityMeterTooltip(
  tone: ReturnType<typeof issueStatusTone>,
  copy: IssuesSurfaceCopy,
): string {
  if (tone === "healthy") return copy.severityTooltip(copy.severityHealthy);
  if (tone === "warning") return copy.severityTooltip(copy.severityWarning);
  if (tone === "critical") return copy.severityTooltip(copy.severityCritical);
  return copy.severityTooltip(copy.valueUnknown);
}

export function IssueSummaryLine({
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

export function IssueValuePill({
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
    navigateWithoutReload(href);
  };
  const openFromKeyboard = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (href === null || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    event.stopPropagation();
    navigateWithoutReload(href);
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

function navigateWithoutReload(href: string): void {
  window.history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

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
      <RecoveryStepRail step={step} tone={tone} />
      <span className="tabular-nums">{tone === "completed" ? "✓" : `${step}/5`}</span>
    </Badge>
  );
}

function RecoveryStepRail({
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

function copyIssueLinkLabel(value: ReactNode): string | undefined {
  return typeof value === "string" ? value : undefined;
}
