import { CircleAlert, RefreshCw, Server } from "lucide-react";
import type { HomePort, HomePortFailure } from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { Surface } from "../../shared/ui/Surface";
import {
  ClusterConnectionStatus,
  clusterDisplayLabel,
} from "../../shared/ui/ClusterConnectionStatus";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../shared/ui/primitives/select";
import { HomeClusterHealth } from "./HomeClusterHealth";
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
    return <ProductStateScreen kind="empty" placement="content" />;
  }

  const selectedCluster = state.choices.data.clusters.find(
    (cluster) => cluster.id === state.selectedClusterId,
  );
  const selectItems = state.choices.data.clusters.map((cluster) => ({
    label: clusterOptionLabel(cluster),
    value: cluster.id,
  }));
  const refreshing = [state.choices, state.overview, state.nodes, state.pods].some(
    (resource) => resource.phase === "ready" && resource.refreshing,
  );

  if (state.clusterAccess.kind === "forbidden") {
    return <HomeFailureScreen failure={state.clusterAccess.failure} onRetry={state.refresh} />;
  }

  return (
    <ProductPageFrame>
      <header className="flex min-w-0 justify-end">
        <div className="flex w-full min-w-0 items-center justify-end gap-2 xl:w-auto">
          {selectedCluster ? (
            <ClusterConnectionStatus
              connectionState={selectedCluster.connectionState}
              lastObservedAt={selectedCluster.lastObservedAt}
            />
          ) : null}
          <Select
            items={selectItems}
            onValueChange={(value) => { if (value) state.selectCluster(value); }}
            value={selectedCluster?.id ?? null}
          >
            <SelectTrigger
              aria-label={t("home.cluster.select")}
              className="w-full min-w-0 flex-1 xl:w-(--product-cluster-select-width) xl:flex-none"
            >
              <Server aria-hidden="true" />
              <SelectValue placeholder={t("home.cluster.select")} />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectLabel>{t("home.cluster.available")}</SelectLabel>
                {selectItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            aria-label={t("common.action.refresh")}
            disabled={refreshing}
            onClick={state.refresh}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw
              aria-hidden="true"
              className={refreshing ? "motion-safe:animate-spin" : undefined}
              data-icon="inline-start"
            />
          </Button>
        </div>
      </header>

      {!state.selectedClusterExists ? (
        <UnknownCluster clusterId={state.selectedClusterId} />
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

function clusterOptionLabel(cluster: {
  environment: string;
  id: string;
  name: string;
}) {
  return clusterDisplayLabel(cluster);
}
