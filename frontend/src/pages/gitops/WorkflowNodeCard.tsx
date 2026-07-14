import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CheckCircle2, GitBranch, ShieldCheck } from "lucide-react";
import { cn } from "../../shared/ui/primitives/cn";
import type { WorkflowNode } from "./workflowGraphTypes";

export function WorkflowNodeCard({ data }: NodeProps<WorkflowNode>) {
  const targetPosition = data.direction === "TB" ? Position.Top : Position.Left;
  const sourcePosition = data.direction === "TB" ? Position.Bottom : Position.Right;
  const icon = data.kind === "approval"
    ? <ShieldCheck aria-hidden="true" className="size-4" />
    : data.kind === "verification"
      ? <CheckCircle2 aria-hidden="true" className="size-4" />
      : <GitBranch aria-hidden="true" className="size-4" />;
  return (
    <div
      className={cn(
        "grid size-full min-w-0 content-start gap-2 overflow-hidden rounded-lg border bg-card p-3 text-card-foreground shadow-sm transition-shadow",
        data.selected && "border-primary ring-2 ring-primary/20",
        data.tone === "danger" && "border-destructive/50",
        data.tone === "warning" && "border-amber-500/50",
        data.tone === "success" && "border-emerald-500/50",
        data.tone === "info" && "border-sky-500/50",
        data.compact && "gap-1.5 p-2.5",
      )}
      title={`${data.title} · ${data.statusLabel}`}
    >
      <Handle className="!size-2 !border-2 !border-background !bg-primary" position={targetPosition} type="target" />
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.625rem] font-semibold tracking-normal text-muted-foreground">
          {data.eyebrow}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[0.625rem] font-medium text-muted-foreground">
          <i aria-hidden="true" className={cn(
            "size-1.5 rounded-full bg-muted-foreground",
            data.tone === "danger" && "bg-destructive",
            data.tone === "warning" && "bg-amber-500",
            data.tone === "success" && "bg-emerald-500",
            data.tone === "info" && "bg-sky-500",
          )} />
          {data.statusLabel}
        </span>
      </div>
      <strong className="line-clamp-2 min-w-0 text-xs leading-4 font-semibold [overflow-wrap:anywhere]">
        {data.title}
      </strong>
      {data.showMetadata && data.kind === "application" ? (
        <div className="grid min-w-0 gap-0.5 text-[0.625rem] leading-3.5 text-muted-foreground">
          <span className="truncate">{data.environment}</span>
          <span className="truncate">{data.cluster}</span>
          <span className="truncate">{data.strategy}</span>
        </div>
      ) : null}
      {data.showMetadata && data.kind !== "application" ? (
        <p className="m-0 line-clamp-2 text-[0.625rem] leading-3.5 text-muted-foreground [overflow-wrap:anywhere]">
          {data.note}
        </p>
      ) : null}
      <Handle className="!size-2 !border-2 !border-background !bg-primary" position={sourcePosition} type="source" />
    </div>
  );
}
