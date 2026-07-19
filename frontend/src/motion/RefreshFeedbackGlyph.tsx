import { Check, CircleX, RefreshCw, WifiOff } from "lucide-react";
import { LazyMotion, domAnimation } from "motion/react";
import * as m from "motion/react-m";

import type { RefreshFeedbackState } from "../shared/ui/RefreshFeedback";
import { cn } from "../shared/lib/cn";
import { MOTION_DURATION_SECONDS } from "./useStagger";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const feedbackTargets = {
  failed: { opacity: 1, scale: 0.96, y: 0 },
  idle: { opacity: 1, scale: 1, y: 0 },
  pending: { opacity: 0.84, scale: 0.96 },
  reconnecting: { opacity: 0.88, scale: 1, y: 0 },
  succeeded: { opacity: 1, scale: 1.06, y: -0.5 },
} satisfies Record<RefreshFeedbackState, object>;

const reducedMotionTarget = { opacity: 1 };
const feedbackTransition = {
  duration: MOTION_DURATION_SECONDS.quick,
  ease: "easeOut",
} as const;
const reducedMotionTransition = { duration: MOTION_DURATION_SECONDS.none } as const;

/** The only Motion-owned refresh rendering surface. */
export function RefreshFeedbackGlyph({
  className,
  iconClassName,
  state,
}: {
  className?: string;
  iconClassName?: string;
  state: RefreshFeedbackState;
}) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <LazyMotion features={domAnimation} strict>
      <m.span
        animate={reducedMotion ? reducedMotionTarget : feedbackTargets[state]}
        aria-hidden="true"
        className={cn("inline-flex shrink-0", feedbackTone(state), className)}
        data-reduced-motion={reducedMotion}
        data-refresh-feedback-state={state}
        data-slot="refresh-feedback"
        initial={false}
        transition={reducedMotion ? reducedMotionTransition : feedbackTransition}
      >
        <FeedbackIcon className={iconClassName} state={state} />
      </m.span>
    </LazyMotion>
  );
}

function FeedbackIcon({
  className,
  state,
}: {
  className?: string;
  state: RefreshFeedbackState;
}) {
  const sharedClassName = cn("size-4", className);
  if (state === "succeeded") return <Check className={sharedClassName} />;
  if (state === "failed") return <CircleX className={sharedClassName} />;
  if (state === "reconnecting") return <WifiOff className={sharedClassName} />;
  return <RefreshCw className={sharedClassName} />;
}

function feedbackTone(state: RefreshFeedbackState): string | undefined {
  if (state === "succeeded") return "text-success";
  if (state === "failed") return "text-destructive";
  if (state === "reconnecting") return "text-warning";
  return undefined;
}
