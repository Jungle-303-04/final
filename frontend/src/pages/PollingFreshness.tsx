import { FreshnessControl, type FreshnessCopy } from "../shared/ui/FreshnessControl";
import { useI18n, type TranslationFunction } from "../shared/i18n";

export function PollingFreshness({
  connectionState = "connected",
  dataUpdatedAt,
  intervalSeconds,
  isFetching,
  onRefresh,
}: {
  connectionState?: "connected" | "disconnected" | "connecting";
  dataUpdatedAt: number;
  intervalSeconds: number;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const { formatDate, t } = useI18n();
  const copy: FreshnessCopy = {
    refreshCancelled: t("common.freshness.refreshCancelled"),
    refreshFailed: t("common.freshness.refreshFailed"),
    polling: t("common.freshness.polling", { seconds: intervalSeconds }),
    pollingDescription: t("common.freshness.pollingDescription"),
    paused: t("common.freshness.paused"),
    pausedDescription: t("common.freshness.pausedDescription"),
    refreshPending: t("common.freshness.refreshPending"),
    reconnecting: t("common.freshness.reconnecting"),
    reconnectingDescription: t("common.freshness.reconnectingDescription"),
    refreshNow: t("common.freshness.refreshNow"),
    refreshSucceeded: t("common.freshness.refreshSucceeded"),
    updated: (elapsedMilliseconds) => formatElapsed(elapsedMilliseconds, t),
    updatedAt: (timestamp) => t("common.freshness.updatedAt", {
      time: formatDate(timestamp, { timeStyle: "medium" }),
    }),
  };
  return (
    <FreshnessControl
      connectionState={connectionState}
      copy={copy}
      dataUpdatedAt={dataUpdatedAt}
      isFetching={isFetching}
      mode="polling"
      onRefresh={onRefresh}
    />
  );
}

function formatElapsed(
  elapsedMilliseconds: number,
  t: TranslationFunction,
): string {
  const seconds = Math.max(0, Math.floor(elapsedMilliseconds / 1_000));
  if (seconds < 60) {
    return t("common.freshness.updatedSeconds", { count: seconds });
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return t("common.freshness.updatedMinutes", { count: minutes });
  }
  return t("common.freshness.updatedHours", {
    count: Math.floor(minutes / 60),
  });
}
