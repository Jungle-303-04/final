import { CircleAlert, RefreshCw } from "lucide-react";
import type { HomePortFailure } from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n/I18nProvider";
import type { TranslationFunction } from "../../shared/i18n/types";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import { Skeleton } from "../../shared/ui/primitives/skeleton";

export function HomeSectionLoading({ label }: { label: string }) {
  const { t } = useI18n();
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="grid gap-2 p-4 md:grid-cols-2"
      role="status"
    >
      <span className="sr-only">{t("home.section.loading", { label })}</span>
      <Skeleton aria-hidden="true" className="h-28" />
      <Skeleton aria-hidden="true" className="h-28" />
    </div>
  );
}

export function HomeSectionFailure({
  failure,
  label,
  onRetry,
}: {
  failure: HomePortFailure;
  label: string;
  onRetry: () => void;
}) {
  const { formatNumber, t } = useI18n();
  const copy = failureCopy(failure, label, t, formatNumber);
  return (
    <Alert className="m-4 w-auto" variant={failure.code === "forbidden" ? "default" : "destructive"}>
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>{copy.description}</AlertDescription>
      <AlertAction>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          <RefreshCw aria-hidden="true" />{t("common.action.refresh")}
        </Button>
      </AlertAction>
    </Alert>
  );
}

export function HomeRefreshFailure({
  failure,
  label,
  onRetry,
}: {
  failure: HomePortFailure | null;
  label: string;
  onRetry: () => void;
}) {
  const { formatNumber, t } = useI18n();
  if (!failure) return null;
  const copy = failureCopy(failure, label, t, formatNumber);
  return (
    <Alert className="m-4 mb-0 w-auto">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{t("home.refresh.lastSuccess")}</AlertTitle>
      <AlertDescription>{copy.description}</AlertDescription>
      <AlertAction>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          <RefreshCw aria-hidden="true" />{t("common.action.refresh")}
        </Button>
      </AlertAction>
    </Alert>
  );
}

function failureCopy(
  failure: HomePortFailure,
  label: string,
  t: TranslationFunction,
  formatNumber: (value: number) => string,
) {
  if (failure.code === "forbidden") {
    return {
      title: t("home.failure.forbidden.title"),
      description: t("home.failure.forbidden.description", { label }),
    };
  }
  if (failure.code === "rate-limited") {
    const retry = failure.retryAfterSeconds === null
      ? t("home.failure.rateLimited.retryLater")
      : t("home.failure.rateLimited.retryAfter", {
        seconds: formatNumber(failure.retryAfterSeconds),
      });
    return {
      title: t("home.failure.rateLimited.title"),
      description: t("home.failure.rateLimited.description", { label, retry }),
    };
  }
  if (failure.code === "not-found") {
    return {
      title: t("home.failure.notFound.title"),
      description: t("home.failure.notFound.description", { label }),
    };
  }
  if (failure.code === "offline") {
    return {
      title: t("home.failure.offline.title"),
      description: t("home.failure.offline.description", { label }),
    };
  }
  if (failure.code === "invalid-response") {
    return {
      title: t("home.failure.invalidResponse.title"),
      description: t("home.failure.invalidResponse.description", { label }),
    };
  }
  return {
    title: t("home.failure.generic.title"),
    description: t("home.failure.generic.description", { label }),
  };
}
