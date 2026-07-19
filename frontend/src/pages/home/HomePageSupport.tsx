import { CircleAlert } from "lucide-react";

import type {
  HomeClusterChoice,
  HomePortFailure,
} from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Surface } from "../../shared/ui/Surface";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../shared/ui/primitives/alert";
import type { DisconnectPhase } from "../clusters/ClusterDisconnectDialog";
import { useHomePageState } from "./useHomePageState";

export function exactIncidentSum(clusters: readonly HomeClusterChoice[]): number | null {
  if (clusters.length === 0) return null;
  let total = 0;
  for (const cluster of clusters) {
    const count = cluster.openIncidentCount ?? cluster.incidentCount;
    if (count == null) return null;
    total += count;
  }
  return total;
}

export function isResumableDisconnectPhase(phase: DisconnectPhase): boolean {
  return phase === "submitting" || phase === "uninstalling" || phase === "cleanup-required";
}

export function homeConnectionState(state: ReturnType<typeof useHomePageState>) {
  const resources = [state.choices, state.overview, state.insights, state.nodes, state.pods];
  return resources.some((resource) =>
    resource.phase === "failed" ||
    (resource.phase === "ready" && resource.refreshFailure !== null)
  ) ? "disconnected" as const : "connected" as const;
}

export function HomeClusterBoundary({
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

export function UnknownCluster({ clusterId }: { clusterId: string | null }) {
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

export function PartialFailureBanner({
  clusterCardsPartial,
  state,
}: {
  clusterCardsPartial: boolean;
  state: ReturnType<typeof useHomePageState>;
}) {
  const { t } = useI18n();
  const failures = [state.overview, state.insights, state.nodes].filter(
    (section) => section.phase === "failed" ||
      (section.phase === "ready" && section.refreshFailure !== null),
  );
  if (failures.length === 0 && !clusterCardsPartial) return null;
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

export function HomeFailureScreen({
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
