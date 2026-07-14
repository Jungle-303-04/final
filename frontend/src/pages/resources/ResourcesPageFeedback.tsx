import { CircleAlert, Inbox, LockKeyhole } from "lucide-react";
import { useState } from "react";
import type { HomeClusterChoices } from "../../features/home/homeContract";
import type {
  ResourceCatalog,
  ResourceList,
  ResourcesPortFailure,
} from "../../features/resources/resourcesContract";
import { useI18n } from "../../shared/i18n";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Surface } from "../../shared/ui/Surface";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import type { ResourcesResourceState } from "./resourcesPageStateModel";
import type { ResourcesFilterPageState } from "./resourcesFilterPageStateModel";
import type { ResourcesFilterResourcePage } from "../../features/resources/resourcesFilterContract";

export function UnknownCompletenessEmpty({
  variant,
}: {
  variant: "catalog" | "list";
}) {
  const { t } = useI18n();
  const title =
    variant === "catalog"
      ? t("resources.empty.catalogTitle")
      : t("resources.empty.listTitle");
  return (
    <Surface
      aria-labelledby="resources-unknown-empty-title"
      className="grid min-h-72 place-items-center p-6"
    >
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <Inbox aria-hidden="true" className="size-8 text-muted-foreground" />
        <h2
          className="text-lg font-semibold"
          id="resources-unknown-empty-title"
        >
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("resources.empty.observedZero")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("resources.empty.unknownCompleteness")}
        </p>
      </div>
    </Surface>
  );
}

export function UnknownSelection({
  value,
  variant,
}: {
  value: string | null;
  variant: "cluster" | "resource";
}) {
  const { t } = useI18n();
  const title =
    variant === "cluster"
      ? t("resources.selection.cluster.title")
      : t("resources.selection.resource.title");
  return (
    <Surface
      aria-labelledby="unknown-selection-title"
      className="grid min-h-72 place-items-center p-6"
    >
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <CircleAlert
          aria-hidden="true"
          className="size-8 text-muted-foreground"
        />
        <h3 className="text-lg font-semibold" id="unknown-selection-title">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("resources.selection.description", {
            value: value ?? t("resources.selection.urlScope"),
          })}
        </p>
      </div>
    </Surface>
  );
}

export function UnsupportedFilterProjection({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const content = (
    <div className="grid max-w-md justify-items-center gap-3 text-center">
      <CircleAlert
        aria-hidden="true"
        className="size-8 text-muted-foreground"
      />
      <h3
        className="text-lg font-semibold"
        id="resources-filter-unsupported-title"
      >
        {t("resources.filter.unsupported.title")}
      </h3>
      <p className="text-sm text-muted-foreground">
        {t("resources.filter.unsupported.description")}
      </p>
    </div>
  );
  if (embedded) {
    return (
      <section
        aria-labelledby="resources-filter-unsupported-title"
        className="grid min-h-72 place-items-center p-6"
      >
        {content}
      </section>
    );
  }
  return (
    <Surface
      aria-labelledby="resources-filter-unsupported-title"
      className="grid min-h-72 place-items-center p-6"
    >
      {content}
    </Surface>
  );
}

export function ResourcesClusterBoundary({
  variant,
}: {
  variant: "catalog-unconfirmed" | "multiple" | "required";
}) {
  const { t } = useI18n();
  const key =
    variant === "catalog-unconfirmed" ? "catalogUnconfirmed" : variant;
  return (
    <Surface
      aria-labelledby="resources-cluster-boundary-title"
      className="grid min-h-72 place-items-center p-6"
    >
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <CircleAlert
          aria-hidden="true"
          className="size-8 text-muted-foreground"
        />
        <h2
          className="text-lg font-semibold"
          id="resources-cluster-boundary-title"
        >
          {t(`resources.selection.${key}.title`)}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(`resources.selection.${key}.description`)}
        </p>
      </div>
    </Surface>
  );
}

export function ResourcesDenied({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <Surface
      aria-labelledby="resources-denied-title"
      className="grid min-h-72 place-items-center p-6"
    >
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <LockKeyhole
          aria-hidden="true"
          className="size-8 text-muted-foreground"
        />
        <h2 className="text-lg font-semibold" id="resources-denied-title">
          {t("resources.denied.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("resources.denied.description")}
        </p>
        <Button onClick={onRetry} type="button">
          {t("resources.denied.retry")}
        </Button>
      </div>
    </Surface>
  );
}

export function ResourcesFailure({
  failure,
  onRetry,
  retryWaitSeconds,
}: {
  failure: ResourcesPortFailure;
  onRetry: () => void;
  retryWaitSeconds: number | null;
}) {
  const { formatNumber, t } = useI18n();
  if (failure.code === "forbidden")
    return <ResourcesDenied onRetry={onRetry} />;
  if (failure.code === "rate-limited" && retryWaitSeconds !== null) {
    return (
      <Surface
        aria-labelledby="resources-rate-limit-title"
        className="grid min-h-72 place-items-center p-6"
      >
        <div className="grid max-w-md justify-items-center gap-3 text-center">
          <CircleAlert
            aria-hidden="true"
            className="size-8 text-muted-foreground"
          />
          <h2 className="text-lg font-semibold" id="resources-rate-limit-title">
            {t("resources.rateLimited.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("resources.rateLimited.description", {
              seconds: formatNumber(retryWaitSeconds),
            })}
          </p>
        </div>
      </Surface>
    );
  }
  if (failure.code === "offline") {
    return (
      <ProductStateScreen
        issue={{ code: "network" }}
        kind="offline"
        placement="content"
        retry={{ label: t("resources.action.reload"), onRetry, pending: false }}
      />
    );
  }
  return (
    <ProductStateScreen
      issue={{
        code:
          failure.code === "invalid-response" ? "invalid-response" : "server",
      }}
      kind="error"
      placement="content"
      retry={{ label: t("resources.action.reload"), onRetry, pending: false }}
    />
  );
}

export function ResourcesRefreshFeedback({
  catalog,
  choices,
  filterList,
  list,
}: {
  catalog: ResourcesResourceState<ResourceCatalog>;
  choices: ResourcesResourceState<HomeClusterChoices>;
  filterList: ResourcesFilterPageState<ResourcesFilterResourcePage>;
  list: ResourcesResourceState<ResourceList>;
}) {
  const { t } = useI18n();
  const failures = [
    refreshMessage(choices, t("resources.refresh.clusterFailed")),
    refreshMessage(catalog, t("resources.refresh.catalogFailed")),
    refreshMessage(list, t("resources.refresh.listFailed")),
    filterList.refreshFailure ? t("resources.refresh.listFailed") : null,
  ].filter((message): message is string => message !== null);
  if (failures.length === 0) return null;
  return (
    <Alert>
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{t("resources.refresh.partialTitle")}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {failures.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
        <p>{t("resources.refresh.keepLast")}</p>
      </AlertDescription>
    </Alert>
  );
}

export function CatalogFreshness({
  observedAt,
}: {
  observedAt: string | null;
}) {
  const { formatNumber, t } = useI18n();
  const [renderedAt] = useState(() => Date.now());

  if (observedAt === null) {
    return <Badge variant="outline">{t("resources.freshness.missing")}</Badge>;
  }
  const ageMilliseconds = Math.max(0, renderedAt - Date.parse(observedAt));
  const ageMinutes = Math.floor(ageMilliseconds / 60_000);
  const stale = ageMilliseconds > 90_000;
  if (!stale) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
      role="status"
    >
      <Badge variant="destructive">{t("resources.freshness.stale")}</Badge>
      <span>
        {t("resources.freshness.ageMinutes", {
          minutes: formatNumber(ageMinutes),
        })}
      </span>
    </div>
  );
}

function refreshMessage<T>(
  state: ResourcesResourceState<T>,
  message: string,
): string | null {
  return state.phase === "ready" && state.refreshFailure ? message : null;
}
