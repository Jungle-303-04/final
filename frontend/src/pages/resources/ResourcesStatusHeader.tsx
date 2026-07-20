import type {
  ResourceManifestCreatePort,
  ResourceManifestPort,
} from "../../features/resources/resourceManifestContract";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Badge } from "../../shared/ui/primitives/badge";
import { PollingFreshness } from "../PollingFreshness";
import { ResourceManifestCreateDialog } from "./ResourceManifestCreateDialog";
import { ResourcesLiveStatus } from "./ResourcesLiveStatus";
import type { PhysicalTopologyLiveState } from "./usePhysicalTopologyRealtime";

export function ResourcesStatusHeader({
  automaticRefreshPaused,
  clusterId,
  createNamespace,
  live,
  manifestPort,
  onInvalidate,
  onRefresh,
  onUnauthorized,
  pollingDisconnected,
  pollingUpdatedAt,
  refreshAfterSeconds,
  refreshing,
}: {
  automaticRefreshPaused: boolean;
  clusterId: string | null;
  createNamespace: string | null;
  live: PhysicalTopologyLiveState;
  manifestPort?: ResourceManifestPort;
  onInvalidate: () => void;
  onRefresh: () => void;
  onUnauthorized: () => void;
  pollingDisconnected: boolean;
  pollingUpdatedAt: number;
  refreshAfterSeconds: number | null;
  refreshing: boolean;
}) {
  const { t } = useI18n();
  return (
    <header className="flex min-w-0 justify-end">
      <div
        className="flex h-8 w-full min-w-0 flex-nowrap items-center justify-end gap-2"
        data-slot="resources-status-row"
      >
        {isResourceManifestCreatePort(manifestPort) && clusterId !== null && createNamespace !== null ? (
          <ResourceManifestCreateDialog
            clusterId={clusterId}
            namespace={createNamespace}
            onInvalidate={onInvalidate}
            onUnauthorized={onUnauthorized}
            port={manifestPort}
          />
        ) : null}
        {automaticRefreshPaused ? (
          <Badge variant="outline">{t("resources.refresh.paused")}</Badge>
        ) : null}
        <ResourcesLiveStatus state={live} />
        {refreshAfterSeconds === null ? null : (
          <div
            aria-hidden={live.status === "connected" || undefined}
            className={cn(
              "flex h-8 shrink-0 items-center",
              live.status === "connected" && "invisible",
            )}
            data-slot="resources-polling-fallback"
            inert={live.status === "connected"}
          >
            <PollingFreshness
              connectionState={pollingDisconnected ? "disconnected" : "connected"}
              dataUpdatedAt={pollingUpdatedAt}
              intervalSeconds={refreshAfterSeconds}
              isFetching={refreshing}
              onRefresh={onRefresh}
            />
          </div>
        )}
      </div>
    </header>
  );
}

function isResourceManifestCreatePort(
  port: ResourceManifestPort | undefined,
): port is ResourceManifestPort & ResourceManifestCreatePort {
  return typeof port?.loadCreateCapability === "function"
    && typeof port.dryRunCreate === "function"
    && typeof port.createResources === "function";
}
