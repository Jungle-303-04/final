import { useI18n } from "../../shared/i18n";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { RefreshAction } from "../../shared/ui/RefreshFeedback";
import { applicationsCopy } from "../../shared/i18n/applicationSurfaceCopy";
import type { ApplicationsFailure } from "./applicationsContract";
import type { ApplicationsResource } from "./useApplicationsData";

export function ApplicationsRefreshControl<T>({
  onRefresh,
  resource,
}: {
  onRefresh: () => void;
  resource: Extract<ApplicationsResource<T>, { phase: "ready" }>;
}) {
  const { locale } = useI18n();
  const copy = applicationsCopy(locale);
  const feedback = resource.refreshing
    ? copy.refreshing
    : resource.refreshFailure
      ? copy.refreshFailed
      : null;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <RefreshAction
        hasFailed={resource.refreshFailure !== null}
        iconOnly
        isRefreshing={resource.refreshing}
        label={copy.refresh}
        onRefresh={onRefresh}
        size="icon"
      />
      {feedback ? (
        <span
          aria-atomic="true"
          aria-live="polite"
          className={resource.refreshFailure ? "text-xs text-destructive" : "sr-only"}
          data-slot="applications-refresh-feedback"
          role={resource.refreshFailure ? "alert" : "status"}
        >
          {feedback}
        </span>
      ) : null}
    </div>
  );
}

export function ApplicationsFailureState({
  failure,
  onRetry,
}: {
  failure: ApplicationsFailure;
  onRetry: () => void;
}) {
  if (failure.code === "forbidden") {
    return <ProductStateScreen issue={{ code: "forbidden" }} kind="forbidden" placement="content" />;
  }
  if (failure.code === "offline") {
    return (
      <ProductStateScreen
        issue={{ code: "network" }}
        kind="offline"
        placement="content"
        retry={{ onRetry, pending: false }}
      />
    );
  }
  return (
    <ProductStateScreen
      issue={{ code: failure.code === "invalid-response" ? "invalid-response" : "server" }}
      kind="error"
      placement="content"
      retry={{ onRetry, pending: false }}
    />
  );
}
