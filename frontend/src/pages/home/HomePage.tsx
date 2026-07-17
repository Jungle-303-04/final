import { Activity, CircleAlert } from "lucide-react";
import type { HomePort, HomePortFailure } from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductPageHeader } from "../../shared/ui/ProductPageHeader";
import { Surface } from "../../shared/ui/Surface";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { PollingFreshness } from "../PollingFreshness";
import { HomeClusterHealth } from "./HomeClusterHealth";
import { HomeClusterGrid } from "./HomeClusterGrid";
import { HomeIssuesRail } from "./HomeIssuesRail";
import { HomeLiveBand } from "./HomeLiveBand";
import { useHomePageState } from "./useHomePageState";

export function HomePage({ port }: { port: HomePort }) {
  const { t } = useI18n();
  const state = useHomePageState(port);

  if (state.choices.phase === "loading" || state.choices.phase === "idle") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (state.choices.phase === "failed") {
    return <HomeFailureScreen failure={state.choices.failure} onRetry={state.refresh} />;
  }
  if (state.choices.data.clusters.length === 0) {
    return <HomeClusterBoundary variant="catalog-unconfirmed" />;
  }

  const selectedCluster = state.choices.data.clusters.find(
    (cluster) => cluster.id === state.selectedClusterId,
  );
  if (state.clusterAccess.kind === "forbidden") {
    return <HomeFailureScreen failure={state.clusterAccess.failure} onRetry={state.refresh} />;
  }
  const refreshing = [state.choices, state.overview, state.nodes, state.pods].some(
    (resource) => resource.phase === "ready" && resource.refreshing,
  );

  return (
    <ProductPageFrame>
      <ProductPageHeader
        actions={(
          <PollingFreshness
            connectionState={homeConnectionState(state)}
            dataUpdatedAt={state.dataUpdatedAt}
            intervalSeconds={state.selectedNodeName ? 5 : 10}
            isFetching={refreshing}
            onRefresh={state.refresh}
          />
        )}
        description={t("home.page.description")}
        icon={Activity}
        meta={(
          <>
            <span className="truncate font-medium text-foreground">
              {selectedCluster?.name ?? t("clusterScope.all")}
            </span>
            {selectedCluster?.environment ? (
              <Badge variant="outline">{selectedCluster.environment}</Badge>
            ) : null}
          </>
        )}
        title={t("home.page.title")}
      />
      {!state.selectedClusterExists ? (
        state.clusterSelection.kind === "unfiltered" ? (
          <HomeClusterGrid clusters={state.choices.data.clusters} />
        ) : state.clusterSelection.kind === "multiple" ? (
          <HomeClusterBoundary variant="multiple" />
        ) : (
          <UnknownCluster clusterId={state.selectedClusterId} />
        )
      ) : (
        <>
          <PartialFailureBanner state={state} />
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid min-w-0 content-start gap-4">
              <HomeClusterHealth
                cluster={selectedCluster ?? null}
                onRefresh={state.refresh}
                overview={state.overview}
              />
              <HomeLiveBand state={state} />
            </div>
            <HomeIssuesRail
              cluster={selectedCluster ?? null}
              onRefresh={state.refresh}
              overview={state.overview}
            />
          </div>
        </>
      )}
    </ProductPageFrame>
  );
}

function homeConnectionState(state: ReturnType<typeof useHomePageState>) {
  const resources = [state.choices, state.overview, state.nodes, state.pods];
  return resources.some((resource) =>
    resource.phase === "failed" ||
    (resource.phase === "ready" && resource.refreshFailure !== null)
  ) ? "disconnected" as const : "connected" as const;
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
  const failures = [state.overview, state.nodes].filter(
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
