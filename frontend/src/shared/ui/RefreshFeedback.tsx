import { Check, CircleX, RefreshCw, WifiOff } from "lucide-react";
import { LazyMotion, domAnimation } from "motion/react";
import * as m from "motion/react-m";

import { MOTION_DURATION_MS } from "../../motion/useStagger";
import { usePrefersReducedMotion } from "../../motion/usePrefersReducedMotion";
import { cn } from "../lib/cn";
import { Button } from "./primitives/button";
import { useRefreshAnimation, type RefreshPhase } from "./useRefreshAnimation";

export type RefreshFeedbackState =
  | "idle"
  | "pending"
  | "succeeded"
  | "failed"
  | "reconnecting";

interface RefreshFeedbackOptions {
  dataUpdatedAt?: number;
  hasFailed?: boolean;
  isRefreshing?: boolean;
  isReconnecting?: boolean;
  onRefresh: () => void | Promise<unknown>;
}

/**
 * Adapts already-observed data-frame state to one shared, visual-only refresh
 * indicator. Callers retain ownership of their API contract and live copy.
 */
export function useRefreshFeedback({
  dataUpdatedAt,
  hasFailed = false,
  isReconnecting = false,
  isRefreshing = false,
  onRefresh,
}: RefreshFeedbackOptions) {
  const refreshAnimation = useRefreshAnimation(onRefresh, {
    dataUpdatedAt,
    hasFailed,
    isFetching: isRefreshing,
  });
  return {
    ...refreshAnimation,
    state: refreshFeedbackState({
      hasFailed,
      isReconnecting,
      phase: refreshAnimation.phase,
    }),
  };
}

export function refreshFeedbackState({
  hasFailed = false,
  isReconnecting = false,
  phase,
}: {
  hasFailed?: boolean;
  isReconnecting?: boolean;
  phase: RefreshPhase;
}): RefreshFeedbackState {
  if (phase === "failed" || hasFailed) return "failed";
  if (isReconnecting) return "reconnecting";
  if (phase === "succeeded") return "succeeded";
  if (phase === "pending") return "pending";
  return "idle";
}

/**
 * Exactly one decorative status glyph. It never owns status announcements or
 * focus: the calling control keeps those semantics next to its data contract.
 */
export function RefreshFeedback({
  className,
  iconClassName,
  state,
}: {
  className?: string;
  iconClassName?: string;
  state: RefreshFeedbackState;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const Icon = feedbackIcon(state);

  return (
    <LazyMotion features={domAnimation} strict>
      <m.span
        animate={reducedMotion ? { opacity: 1 } : feedbackTarget(state)}
        aria-hidden="true"
        className={cn("inline-flex shrink-0", feedbackTone(state), className)}
        data-reduced-motion={reducedMotion}
        data-refresh-feedback-state={state}
        data-slot="refresh-feedback"
        initial={false}
        transition={{
          duration: reducedMotion ? 0 : MOTION_DURATION_MS.quick / 1_000,
          ease: "easeOut",
        }}
      >
        <Icon className={cn("size-4", iconClassName)} />
      </m.span>
    </LazyMotion>
  );
}

/** A shared button shell for page-level data frames; icon-only is opt-in. */
export function RefreshAction({
  hasFailed = false,
  iconOnly = false,
  isReconnecting = false,
  isRefreshing = false,
  label,
  onRefresh,
  size = "sm",
  variant = "outline",
}: {
  hasFailed?: boolean;
  iconOnly?: boolean;
  isReconnecting?: boolean;
  isRefreshing?: boolean;
  label: string;
  onRefresh: () => void | Promise<unknown>;
  size?: "default" | "sm" | "lg" | "icon" | "icon-sm";
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
}) {
  const { phase, refresh, state } = useRefreshFeedback({
    hasFailed,
    isReconnecting,
    isRefreshing,
    onRefresh,
  });
  const pending = phase === "pending" || isRefreshing;

  return (
    <Button
      aria-busy={pending || undefined}
      aria-label={iconOnly ? label : undefined}
      disabled={pending}
      onClick={refresh}
      size={size}
      type="button"
      variant={variant}
    >
      <RefreshFeedback state={state} />
      {iconOnly ? <span className="sr-only">{label}</span> : label}
    </Button>
  );
}

function feedbackIcon(state: RefreshFeedbackState) {
  if (state === "succeeded") return Check;
  if (state === "failed") return CircleX;
  if (state === "reconnecting") return WifiOff;
  return RefreshCw;
}

function feedbackTone(state: RefreshFeedbackState): string | undefined {
  if (state === "succeeded") return "text-success";
  if (state === "failed") return "text-destructive";
  if (state === "reconnecting") return "text-warning";
  return undefined;
}

function feedbackTarget(state: RefreshFeedbackState) {
  if (state === "pending") return { opacity: 0.84, scale: 0.96 };
  if (state === "succeeded") return { opacity: 1, scale: 1.06, y: -0.5 };
  if (state === "failed") return { opacity: 1, scale: 0.96, y: 0 };
  if (state === "reconnecting") return { opacity: 0.88, scale: 1, y: 0 };
  return { opacity: 1, scale: 1, y: 0 };
}
