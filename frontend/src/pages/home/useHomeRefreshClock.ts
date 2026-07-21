import { useVisibleRefreshClock } from "../../shared/data/useVisibleRefreshClock";

const HOME_SUMMARY_POLL_INTERVAL_MS = 10_000;
const HOME_POD_POLL_INTERVAL_MS = 5_000;

export function useHomeRefreshClock(enabled: boolean) {
  const summary = useVisibleRefreshClock(enabled, HOME_SUMMARY_POLL_INTERVAL_MS);
  const pods = useVisibleRefreshClock(enabled, HOME_POD_POLL_INTERVAL_MS);
  return {
    refresh() {
      summary.refresh();
      pods.refresh();
    },
    podRevision: pods.revision,
    summaryRevision: summary.revision,
  };
}
