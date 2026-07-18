import {
  Check,
  Circle,
  CircleAlert,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

export type ConnectStageState = "active" | "complete" | "error" | "pending";

export interface ConnectStage {
  description?: ReactNode;
  id: string;
  label: ReactNode;
  state: ConnectStageState;
}

export type ConnectStageTriplet = readonly [
  ConnectStage,
  ConnectStage,
  ConnectStage,
];

export interface ConnectStagesProps {
  ariaLabel: string;
  className?: string;
  stages: ConnectStageTriplet;
}

const stageIcon: Readonly<Record<ConnectStageState, LucideIcon>> = {
  active: LoaderCircle,
  complete: Check,
  error: CircleAlert,
  pending: Circle,
};

function stageClasses(state: ConnectStageState) {
  if (state === "complete") {
    return "border-status-healthy/40 bg-status-healthy/10 text-status-healthy";
  }
  if (state === "error") {
    return "border-status-critical/40 bg-status-critical/10 text-status-critical";
  }
  if (state === "active") {
    return "border-primary/40 bg-primary/10 text-primary";
  }
  return "border-border-subtle bg-muted/50 text-caption-foreground";
}

export function ConnectStages({
  ariaLabel,
  className,
  stages,
}: ConnectStagesProps) {
  return (
    <ol
      aria-label={ariaLabel}
      className={cn("grid min-w-0 grid-cols-3 gap-2", className)}
      data-slot="connect-stages"
    >
      {stages.map((stage, index) => {
        const Icon = stageIcon[stage.state];
        return (
          <li
            aria-current={stage.state === "active" ? "step" : undefined}
            className="relative min-w-0"
            data-stage={stage.id}
            data-state={stage.state}
            key={stage.id}
          >
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-3 right-[calc(50%+0.75rem)] h-px w-[calc(100%-1.5rem)]",
                  stages[index - 1]?.state === "complete"
                    ? "bg-status-healthy/45"
                    : "bg-border-subtle",
                )}
              />
            ) : null}
            <div className="relative grid min-w-0 justify-items-center gap-2 text-center">
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full border",
                  "transition-colors duration-(--motion-quick) ease-(--ease-soft)",
                  stageClasses(stage.state),
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-3.5",
                    stage.state === "active" &&
                      "motion-connect-stage-active",
                  )}
                />
              </span>
              <span className="max-w-full truncate text-label font-semibold text-foreground">
                {stage.label}
              </span>
              {stage.description ? (
                <span className="line-clamp-2 text-caption text-caption-foreground">
                  {stage.description}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
