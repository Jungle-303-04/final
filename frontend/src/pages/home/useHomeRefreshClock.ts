import { useVisibleRefreshClock } from "../../shared/data/useVisibleRefreshClock";

const HOME_POLL_INTERVAL_MS = 30_000;

export function useHomeRefreshClock(enabled: boolean) {
  return useVisibleRefreshClock(enabled, HOME_POLL_INTERVAL_MS);
}
