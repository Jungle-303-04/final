import { type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../shared/ui/primitives/select";
import type { IssuesSurfaceCopy } from "./issuesSurfaceContract";
import {
  normalizeSeverityFilter,
  type IssueSeverityFilter,
} from "./issuesListPresentation";

export function IssueSeverityFilterSelect({
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

export function IssueStateTab({
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
        "inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-2.5 text-muted-foreground transition-[background-color,color,box-shadow] duration-(--motion-micro) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
        active && "bg-card font-semibold text-foreground shadow-sm",
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

export function VisibilityNotice({
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
