import type { ComponentProps, ReactNode } from "react";

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

export interface RefreshStatusCopy {
  cancelled: string;
  failed: string;
  pending: string;
  reconnecting: string;
  succeeded: string;
}

export interface RefreshActionProps extends RefreshFeedbackOptions {
  iconOnly?: boolean;
  label: string;
  renderFeedback: (state: RefreshFeedbackState) => ReactNode;
  size?: ComponentProps<typeof Button>["size"];
  statusCopy: RefreshStatusCopy;
  variant?: ComponentProps<typeof Button>["variant"];
}

/**
 * Adapts already-observed data-frame state to product-owned semantics. The
 * rendering layer is injected so this shared UI module has no Motion runtime
 * dependency and retains ownership of announcements and focus semantics.
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

/** A shared button shell for observed data frames; icon-only is opt-in. */
export function RefreshAction({
  hasFailed = false,
  iconOnly = false,
  isReconnecting = false,
  isRefreshing = false,
  label,
  onRefresh,
  renderFeedback,
  size = "sm",
  statusCopy,
  variant = "outline",
}: RefreshActionProps) {
  const { phase, refresh, state } = useRefreshFeedback({
    hasFailed,
    isReconnecting,
    isRefreshing,
    onRefresh,
  });
  const pending = phase === "pending" || isRefreshing;
  const status = refreshStatusAnnouncement({ phase, state, statusCopy });

  return (
    <span className="inline-flex min-w-0 items-center gap-2" data-slot="refresh-action">
      <Button
        aria-busy={pending || undefined}
        aria-label={iconOnly ? label : undefined}
        disabled={pending}
        onClick={refresh}
        size={size}
        type="button"
        variant={variant}
      >
        {renderFeedback(state)}
        {iconOnly ? <span className="sr-only">{label}</span> : label}
      </Button>
      {status ? (
        <span
          aria-atomic="true"
          aria-live="polite"
          className={state === "failed" ? "text-xs text-destructive" : "sr-only"}
          data-slot="refresh-action-feedback"
          role={state === "failed" ? "alert" : "status"}
        >
          {status}
        </span>
      ) : null}
    </span>
  );
}

export function refreshStatusAnnouncement({
  phase,
  state,
  statusCopy,
}: {
  phase: RefreshPhase;
  state: RefreshFeedbackState;
  statusCopy: RefreshStatusCopy;
}): string | null {
  if (state === "failed") return statusCopy.failed;
  if (phase === "cancelled") return statusCopy.cancelled;
  if (state === "pending") return statusCopy.pending;
  if (state === "succeeded") return statusCopy.succeeded;
  if (state === "reconnecting") return statusCopy.reconnecting;
  return null;
}
