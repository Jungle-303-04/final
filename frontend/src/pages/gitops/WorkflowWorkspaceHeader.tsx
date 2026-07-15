import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { WorkflowInlineHeading } from "./WorkflowInlineHeading";

export function WorkflowWorkspaceHeader({
  actions,
  sticky = false,
  title,
}: {
  actions?: ReactNode;
  sticky?: boolean;
  title: string;
}) {
  return (
    <header
      className={cn(
        "flex min-w-0 flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between",
        sticky && "sticky top-0 z-20 bg-background/95 pt-3 backdrop-blur",
      )}
      data-testid="workflow-workspace-header"
    >
      <WorkflowInlineHeading as="h2" className="flex-1" title={title} />
      {actions ? (
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
