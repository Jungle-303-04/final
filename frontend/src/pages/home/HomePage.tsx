import { CircleAlert } from "lucide-react";
import { useCallback, useState } from "react";
import { useOptionalProductSession } from "../../features/auth/ProductSessionContext";
import type {
  ClusterDisconnectPort,
  ClustersPort,
} from "../../features/clusters/clustersContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { HomePort, HomePortFailure } from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { Surface } from "../../shared/ui/Surface";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { PollingFreshness } from "../PollingFreshness";
import { HomeClusterGrid } from "./HomeClusterGrid";
import { HomeFleetHeader } from "./HomeFleetHeader";
import { useHomePageState } from "./useHomePageState";
import {
  ClusterDisconnectDialog,
  type DisconnectPhase,
} from "../clusters/ClusterDisconnectDialog";
import { ClusterConnectDialog } from "../clusters/ClusterConnectDialog";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import type { HomeBoardPeriod } from "../../features/home-activity/homeActivityContract";
import { HomeWidgetBoard } from "./HomeWidgetBoard";
import type { HomeBoardPorts } from "./useHomeBoardData";

export function HomePage({
  boardPorts,
  clusterPort,
  port,
}: {
  boardPorts?: HomeBoardPorts;
  clusterPort?: ClustersPort & ClusterDisconnectPort;
  port: HomePort;
}) {
  const state = useHomePageState(port);
  const filter = useUnifiedFilter();
  const session = useOptionalProductSession();
  const [connectOpen, setConnectOpen] = useState(false);
  const [disconnectCluster, setDisconnectCluster] = useState<HomeClusterChoice | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnectPhase, setDisconnectPhase] = useState<DisconnectPhase>("confirm");
  const [editingBoard, setEditingBoard] = useState(false);
  const [outOfSync, setOutOfSync] = useState<number | null>(null);
  const updateOutOfSync = useCallback((count: number | null) => {
    setOutOfSync((current) => current === count ? current : count);
  }, []);
  const boardPeriod: HomeBoardPeriod = filter.detail.homePeriod ?? "today";
  const canManageClusters = clusterPort !== undefined &&
    (session?.roles.includes("service_admin") ?? false);

  if (state.choices.phase === "loading" || state.choices.phase === "idle") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (state.choices.phase === "failed") {
    return <HomeFailureScreen failure={state.choices.failure} onRetry={state.refresh} />;
  }
  if (state.clusterAccess.kind === "forbidden") {
    return <HomeFailureScreen failure={state.clusterAccess.failure} onRetry={state.refresh} />;
  }
  const refreshing = [state.choices, state.overview, state.insights, state.nodes, state.pods].some(
    (resource) => resource.phase === "ready" && resource.refreshing,
  );
  const boardCluster = state.choices.data.clusters.find(
    (cluster) => cluster.id === state.selectedClusterId,
  ) ?? null;

  return (
    <ProductPageFrame>
      <HomeFleetHeader
        clusters={state.choices.data.clusters}
        editing={editingBoard}
        freshness={state.refreshIntervalSeconds === null ? null : (
          <PollingFreshness
            connectionState={homeConnectionState(state)}
            dataUpdatedAt={state.dataUpdatedAt}
            intervalSeconds={state.refreshIntervalSeconds}
            isFetching={refreshing}
            onRefresh={state.refresh}
          />
        )}
        onEdit={boardPorts ? () => setEditingBoard((current) => !current) : undefined}
        onConnect={canManageClusters ? () => setConnectOpen(true) : undefined}
        onPeriodChange={boardPorts ? (period) => {
          filter.updateDetail(
            (current) => ({ ...current, homePeriod: period }),
            "home-period",
          );
        } : undefined}
        outOfSync={outOfSync}
        period={boardPorts ? boardPeriod : undefined}
      />
      <HomeClusterGrid
        clusters={state.choices.data.clusters}
        disconnectClusterId={disconnectCluster?.id}
        disconnectPhase={disconnectPhase}
        onConnect={canManageClusters ? () => setConnectOpen(true) : undefined}
        onDisconnect={canManageClusters ? (cluster) => {
          setDisconnectCluster(cluster);
          setDisconnectOpen(true);
        } : undefined}
        onRefresh={state.refresh}
        selectedClusterId={state.selectedClusterId}
        selectedUsage={state.overview.phase === "ready" ? state.overview.data.usage : null}
      />
      {state.choices.data.clusters.length === 0 ? (
        canManageClusters ? null : <HomeClusterBoundary variant="catalog-unconfirmed" />
      ) : !state.selectedClusterExists ? (
        state.clusterSelection.kind === "unfiltered" ? (
          null
        ) : state.clusterSelection.kind === "multiple" ? (
          <HomeClusterBoundary variant="multiple" />
        ) : (
          <UnknownCluster clusterId={state.selectedClusterId} />
        )
      ) : (
        <>
          <PartialFailureBanner state={state} />
          {boardPorts && state.selectedClusterId && boardCluster ? (
            <HomeWidgetBoard
              clusterId={state.selectedClusterId}
              editing={editingBoard}
              freshness={homeScopeFreshness(boardCluster.connectionState)}
              onOutOfSyncChange={updateOutOfSync}
              period={boardPeriod}
              ports={boardPorts}
              refreshKey={state.boardRefreshRevision}
              workspaceId={boardCluster.workspaceId}
            />
          ) : null}
        </>
      )}
      {canManageClusters && clusterPort ? (
        <>
          <ClusterConnectDialog
            existingNames={state.choices.data.clusters.map((cluster) => cluster.name)}
            onConnected={state.refresh}
            onRegistered={state.refresh}
            onOpenChange={setConnectOpen}
            open={connectOpen}
            port={clusterPort}
          />
          <ClusterDisconnectDialog
            cluster={disconnectCluster}
            key={disconnectCluster?.id ?? "closed"}
            onDisconnected={() => state.refresh()}
            onOpenChange={(open) => {
              setDisconnectOpen(open);
              if (!open && !isResumableDisconnectPhase(disconnectPhase)) {
                setDisconnectCluster(null);
              }
            }}
            onPhaseChange={(clusterId, phase) => {
              if (disconnectCluster?.id === clusterId) setDisconnectPhase(phase);
            }}
            open={disconnectOpen && disconnectCluster !== null}
            port={clusterPort}
          />
        </>
      ) : null}
    </ProductPageFrame>
  );
}

function isResumableDisconnectPhase(phase: DisconnectPhase): boolean {
  return phase === "submitting" || phase === "uninstalling" || phase === "cleanup-required";
}

function homeConnectionState(state: ReturnType<typeof useHomePageState>) {
  const resources = [state.choices, state.overview, state.insights, state.nodes, state.pods];
  return resources.some((resource) =>
    resource.phase === "failed" ||
    (resource.phase === "ready" && resource.refreshFailure !== null)
  ) ? "disconnected" as const : "connected" as const;
}

function homeScopeFreshness(
  connectionState: HomeClusterChoice["connectionState"],
): "live" | "stale" | "partial" | "disconnected" {
  if (connectionState === "online") return "live";
  if (connectionState === "stale") return "stale";
  if (connectionState === "offline") return "disconnected";
  return "partial";
}

function HomeClusterBoundary({
  variant,
}: {
  variant: "catalog-unconfirmed" | "multiple" | "required";
}) {
  const { t } = useI18n();
  const key = variant === "catalog-unconfirmed" ? "catalogUnconfirmed" : variant;
  return (
    <Surface aria-labelledby="home-cluster-boundary-title" className="grid min-h-72 place-items-center p-6">
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <CircleAlert aria-hidden="true" className="size-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold" id="home-cluster-boundary-title">
          {t(`home.cluster.${key}.title`)}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(`home.cluster.${key}.description`)}
        </p>
      </div>
    </Surface>
  );
}

function UnknownCluster({ clusterId }: { clusterId: string | null }) {
  const { t } = useI18n();
  return (
    <Surface aria-labelledby="unknown-cluster-title" className="grid min-h-72 place-items-center p-6">
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <CircleAlert aria-hidden="true" className="size-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold" id="unknown-cluster-title">
          {t("home.cluster.unknown.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("home.cluster.unknown.description", {
            cluster: clusterId ?? t("home.cluster.label"),
          })}
        </p>
      </div>
    </Surface>
  );
}

function PartialFailureBanner({ state }: { state: ReturnType<typeof useHomePageState> }) {
  const { t } = useI18n();
  const failures = [state.overview, state.insights, state.nodes].filter(
    (section) => section.phase === "failed" ||
      (section.phase === "ready" && section.refreshFailure !== null),
  );
  if (failures.length === 0) return null;
  return (
    <Alert>
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{t("home.partial.title")}</AlertTitle>
      <AlertDescription>
        {t("home.partial.description")}
      </AlertDescription>
    </Alert>
  );
}

function HomeFailureScreen({
  failure,
  onRetry,
}: {
  failure: HomePortFailure;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  if (failure.code === "forbidden") {
    return (
      <ProductStateScreen
        issue={{ code: "forbidden" }}
        kind="forbidden"
        placement="content"
      />
    );
  }
  if (failure.code === "offline") {
    return (
      <ProductStateScreen
        issue={{ code: "network" }}
        kind="offline"
        placement="content"
        retry={{ label: t("home.action.reconnect"), onRetry, pending: false }}
      />
    );
  }
  return (
    <ProductStateScreen
      issue={{ code: failure.code === "invalid-response" ? "invalid-response" : "server" }}
      kind="error"
      placement="content"
      retry={{
        label: t("home.action.reload"),
        onRetry,
        pending: false,
      }}
    />
  );
}
