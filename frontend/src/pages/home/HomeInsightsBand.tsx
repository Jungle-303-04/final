import { Boxes, CalendarClock, ExternalLink, PackageOpen } from "lucide-react";
import type { ReactNode } from "react";
import { routeDefinitionForSurface } from "../../app/productRoutes";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { createEmptyProductDetailQuery } from "../../features/filters/filterContract";
import type {
  HomeInsightAvailability,
  HomeInsights,
} from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { Surface, SurfaceSection } from "../../shared/ui/Surface";
import { Badge } from "../../shared/ui/primitives/badge";
import { buttonVariants } from "../../shared/ui/primitives/button";
import {
  HomeRefreshFailure,
  HomeSectionFailure,
  HomeSectionLoading,
} from "./HomeSectionFeedback";
import type { HomeResourceState } from "./useHomePageState";

export function HomeInsightsBand({
  insights,
  onRefresh,
}: {
  insights: HomeResourceState<HomeInsights>;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const busy = insights.phase === "idle" || insights.phase === "loading" ||
    (insights.phase === "ready" && insights.refreshing);
  return (
    <Surface
      aria-busy={busy || undefined}
      aria-labelledby="home-insights-title"
      className="grid min-w-0 overflow-hidden"
    >
      <div className="flex min-h-16 items-center justify-between gap-3 border-b p-4">
        <h2 className="truncate text-base font-semibold" id="home-insights-title">
          {t("home.section.insights")}
        </h2>
      </div>
      <HomeInsightsContent insights={insights} onRefresh={onRefresh} />
    </Surface>
  );
}

function HomeInsightsContent({
  insights,
  onRefresh,
}: {
  insights: HomeResourceState<HomeInsights>;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  if (insights.phase === "idle" || insights.phase === "loading") {
    return <HomeSectionLoading label={t("home.section.insights")} />;
  }
  if (insights.phase === "failed") {
    return (
      <HomeSectionFailure
        failure={insights.failure}
        label={t("home.section.insights")}
        onRetry={onRefresh}
      />
    );
  }
  return (
    <>
      <HomeRefreshFailure
        failure={insights.refreshFailure}
        label={t("home.section.insights")}
        onRetry={onRefresh}
      />
      <SurfaceSection className="grid min-w-0 p-4">
        <CustomResourcesSection insights={insights.data} />
      </SurfaceSection>
    </>
  );
}

function CustomResourcesSection({ insights }: { insights: HomeInsights }) {
  const filter = useUnifiedFilter();
  const { formatNumber, t } = useI18n();
  const summary = insights.customResources;
  const href = filter.navigationHref(routeDefinitionForSurface("resources").path);
  return (
    <HomeInsightSection
      aside={<CoverageBadge availability={summary.coverage.availability} />}
      description={t("home.insights.customResourcesDescription")}
      icon={<Boxes aria-hidden="true" />}
      title={t("home.insights.customResources")}
    >
      {summary.coverage.availability === "unavailable" ? (
        <UnavailableInsight />
      ) : (
        <>
          <div className="grid grid-cols-2 [&>*:nth-child(even)]:border-l [&>*:nth-child(even)]:pl-4 [&>*:nth-child(odd)]:pr-4">
            <InsightMetric
              label={t("home.insights.kinds")}
              value={formatNumber(summary.totalKinds ?? 0)}
            />
            <InsightMetric
              label={t("home.insights.objects")}
              value={formatNumber(summary.totalResources ?? 0)}
            />
          </div>
          {summary.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("home.insights.customResourcesEmpty")}</p>
          ) : (
            <ul className="min-w-0 divide-y border-y">
              {summary.items.map((item) => (
                <li
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3"
                  key={`${item.apiGroup}/${item.version}/${item.kind}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.kind}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.apiGroup}/{item.version}
                    </span>
                  </span>
                  <span className="font-mono text-sm tabular-nums">{formatNumber(item.count)}</span>
                </li>
              ))}
            </ul>
          )}
          {summary.hasMore ? (
            <p className="text-xs text-muted-foreground">{t("home.insights.moreAvailable")}</p>
          ) : null}
        </>
      )}
      <a className={buttonVariants({ variant: "outline" })} href={href}>
        {t("home.insights.openResources")}<ExternalLink aria-hidden="true" />
      </a>
    </HomeInsightSection>
  );
}

export function CertificateExpirySection({ insights }: { insights: HomeInsights }) {
  const filter = useUnifiedFilter();
  const { formatDate, formatNumber, t } = useI18n();
  const summary = insights.certificateExpiry;
  return (
    <HomeInsightSection
      aside={<CoverageBadge availability={summary.coverage.availability} />}
      description={t("home.insights.certificatesDescription")}
      icon={<CalendarClock aria-hidden="true" />}
      title={t("home.insights.certificates")}
    >
      {summary.coverage.availability === "unavailable" ? (
        <p className="text-sm text-muted-foreground">
          {t("home.insights.certificatesUnavailable")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-y-4 [&>*:nth-child(even)]:border-l [&>*:nth-child(even)]:pl-4 [&>*:nth-child(odd)]:pr-4">
            <InsightMetric
              label={t("home.insights.tlsSecrets")}
              value={formatNumber(summary.tlsSecretCount ?? 0)}
            />
            <InsightMetric
              label={t("home.insights.expiryObserved")}
              value={formatNumber(summary.observedExpiryCount ?? 0)}
            />
            <InsightMetric
              label={t("home.insights.expiring")}
              value={formatNumber(summary.expiringCount ?? 0)}
            />
            <InsightMetric
              label={t("home.insights.expired")}
              value={formatNumber(summary.expiredCount ?? 0)}
            />
          </div>
          <ul className="min-w-0 divide-y border-y" aria-label={t("home.insights.certificateList")}>
            {summary.items.map((item) => {
              const detail = createEmptyProductDetailQuery();
              detail.detail = [
                item.secret.kind,
                item.secret.namespace ?? "~",
                item.secret.name,
              ].join("/");
              const href = filter.navigationHref(
                routeDefinitionForSurface("resources").path,
                detail,
              );
              return (
                <li key={item.secret.uid}>
                  <a
                    className="-mx-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    href={href}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {item.secret.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.secret.namespace ?? t("home.insights.clusterScoped")}
                        {" · "}
                        {formatDate(new Date(item.notAfter), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </span>
                    <Badge variant={certificateStatusVariant(item.status)}>
                      {t(`home.insights.certificateStatus.${item.status}`)}
                    </Badge>
                  </a>
                </li>
              );
            })}
          </ul>
          {summary.hasMore ? (
            <p className="text-xs text-muted-foreground">
              {t("home.insights.moreCertificates")}
            </p>
          ) : null}
        </>
      )}
    </HomeInsightSection>
  );
}

function certificateStatusVariant(
  status: HomeInsights["certificateExpiry"]["items"][number]["status"],
): "destructive" | "warning" | "secondary" {
  if (status === "expired") return "destructive";
  if (status === "expiring") return "warning";
  return "secondary";
}

export function HelmSummarySection({ insights }: { insights: HomeInsights }) {
  const filter = useUnifiedFilter();
  const { formatNumber, t } = useI18n();
  const summary = insights.helm;
  const statuses = Object.entries(summary.statusCounts).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  const href = filter.navigationHref(routeDefinitionForSurface("helm").path);
  return (
    <HomeInsightSection
      aside={<CoverageBadge availability={summary.coverage.availability} />}
      description={t("home.insights.helmDescription")}
      icon={<PackageOpen aria-hidden="true" />}
      title={t("home.insights.helm")}
    >
      {summary.coverage.availability === "unavailable" ? (
        <UnavailableInsight />
      ) : (
        <>
          <InsightMetric
            label={t("home.insights.releases")}
            value={formatNumber(summary.releaseCount ?? 0)}
          />
          {statuses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("home.insights.helmEmpty")}</p>
          ) : (
            <ul className="flex min-w-0 flex-wrap gap-2" aria-label={t("home.insights.statuses")}>
              {statuses.map(([status, count]) => (
                <li key={status}>
                  <Badge variant="outline">
                    {t("home.insights.statusCount", {
                      status,
                      count: formatNumber(count),
                    })}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <a className={buttonVariants({ variant: "outline" })} href={href}>
        {t("home.insights.openHelm")}<ExternalLink aria-hidden="true" />
      </a>
    </HomeInsightSection>
  );
}

export function HomeInsightSection({
  aside,
  children,
  description,
  icon,
  title,
}: {
  aside?: ReactNode;
  children: ReactNode;
  description?: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="grid min-w-0 content-start gap-4" data-slot="home-insight-section">
      <header className="grid min-w-0 gap-1.5">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <span aria-hidden="true" className="size-4 shrink-0 [&>svg]:size-4">{icon}</span>
            <span className="truncate" title={title}>{title}</span>
          </h3>
          {aside}
        </div>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function CoverageBadge({ availability }: { availability: HomeInsightAvailability }) {
  const { t } = useI18n();
  return (
    <Badge variant={availability === "available" ? "secondary" : "outline"}>
      {t(`home.insights.coverage.${availability}`)}
    </Badge>
  );
}

function UnavailableInsight() {
  const { t } = useI18n();
  return <p className="text-sm text-muted-foreground">{t("home.insights.unavailable")}</p>;
}

function InsightMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className="truncate text-xl font-semibold tabular-nums" title={value}>{value}</strong>
    </div>
  );
}
