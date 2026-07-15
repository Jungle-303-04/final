import { FreshnessControl, type FreshnessCopy } from "../shared/ui/FreshnessControl";
import { useI18n } from "../shared/i18n";

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
  const { locale } = useI18n();
  return (
    <FreshnessControl
      connectionState={connectionState}
      copy={freshnessCopy(locale, intervalSeconds)}
      dataUpdatedAt={dataUpdatedAt}
      isFetching={isFetching}
      mode="polling"
      onRefresh={onRefresh}
    />
  );
}

function freshnessCopy(locale: "ko" | "en", intervalSeconds: number): FreshnessCopy {
  if (locale === "ko") {
    return {
      refreshCancelled: "새로 고침이 취소되었습니다.",
      refreshFailed: "새로 고침에 실패했습니다.",
      polling: `${intervalSeconds}초마다 확인`,
      pollingDescription: "화면이 보이는 동안 새 값을 주기적으로 확인합니다.",
      paused: "갱신 일시정지",
      pausedDescription: "자동 확인을 다시 시작하면 최신 값을 불러옵니다.",
      refreshPending: "새로 고치는 중",
      reconnecting: "연결 확인 중",
      reconnectingDescription: "마지막 값을 유지한 채 연결을 다시 확인하고 있습니다.",
      refreshNow: "새로 고침",
      refreshSucceeded: "새로 고쳤습니다.",
      updated: formatElapsedKo,
      updatedAt: (timestamp) => `마지막 갱신 ${new Date(timestamp).toLocaleTimeString("ko-KR")}`,
    };
  }
  return {
    refreshCancelled: "Refresh cancelled.",
    refreshFailed: "Refresh failed.",
    polling: `Checks every ${intervalSeconds}s`,
    pollingDescription: "Checks for new values while this page is visible.",
    paused: "Updates paused",
    pausedDescription: "Resume automatic checks to load current values.",
    refreshPending: "Refreshing",
    reconnecting: "Checking connection",
    reconnectingDescription: "Keeping the last value while checking the connection.",
    refreshNow: "Refresh now",
    refreshSucceeded: "Refreshed.",
    updated: formatElapsedEn,
    updatedAt: (timestamp) => `Last updated ${new Date(timestamp).toLocaleTimeString("en-US")}`,
  };
}

function formatElapsedKo(elapsedMilliseconds: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMilliseconds / 1_000));
  if (seconds < 60) return `${seconds}초 전 갱신`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전 갱신`;
  return `${Math.floor(minutes / 60)}시간 전 갱신`;
}

function formatElapsedEn(elapsedMilliseconds: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMilliseconds / 1_000));
  if (seconds < 60) return `updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `updated ${minutes}m ago`;
  return `updated ${Math.floor(minutes / 60)}h ago`;
}
