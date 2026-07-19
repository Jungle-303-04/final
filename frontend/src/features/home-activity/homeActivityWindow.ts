import type {
  HomeActivityQuery,
  HomeBoardPeriod,
} from "./homeActivityContract";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function activityWindowForPeriod(
  period: HomeBoardPeriod,
  nowMs: number,
): HomeActivityQuery | null {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return null;
  const todayStart = new Date(nowMs);
  todayStart.setHours(0, 0, 0, 0);
  const fromMs = period === "today"
    ? todayStart.getTime()
    : nowMs - (period === "7d" ? 7 : 30) * DAY_MS;
  const width = nowMs - fromMs;
  if (width < MINUTE_MS) return null;
  return {
    fromMs,
    toMs: nowMs,
    bucketMs: period === "today"
      ? Math.min(HOUR_MS, width)
      : period === "7d" ? 6 * HOUR_MS : DAY_MS,
  };
}
