import { useI18n } from "../../shared/i18n";
import {
  ClusterConnectionMark,
  type ClusterConnectionState,
} from "../../shared/ui/ClusterConnectionStatus";

export function GlobalFilterClusterConnectionMark({
  clusterLabel,
  connectionState,
  onRefresh,
  refreshing,
}: {
  clusterLabel: string;
  connectionState: ClusterConnectionState;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { t } = useI18n();
  const mark = <ClusterConnectionMark compact connectionState={connectionState} />;
  if (connectionState !== "offline") return mark;

  return (
    <button
      aria-busy={refreshing}
      aria-label={t("shell.filter.cluster.refreshStatus", { cluster: clusterLabel })}
      className="grid size-4 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:data-[refreshing=true]:animate-pulse motion-reduce:animate-none"
      data-refreshing={refreshing}
      disabled={refreshing}
      onClick={(event) => {
        event.stopPropagation();
        onRefresh();
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      type="button"
    >
      {mark}
    </button>
  );
}
