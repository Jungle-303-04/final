import {
  Activity,
  BadgeCheck,
  ExternalLink,
  GitBranch,
  Network,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { routeDefinitionForSurface } from "../../app/productRoutes";
import { createEmptyProductDetailQuery } from "../../features/filters/filterContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { HomeInsights } from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { Surface } from "../../shared/ui/Surface";
import { buttonVariants } from "../../shared/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { CertificateExpiryCard, HelmSummaryCard } from "./HomeInsightsBand";
import {
  HomeRefreshFailure,
  HomeSectionFailure,
  HomeSectionLoading,
} from "./HomeSectionFeedback";
import type { HomePageState, HomeResourceState } from "./useHomePageState";

export function HomeSourceBands({ state }: { state: HomePageState }) {
  return (
    <>
      <LiveObservationBand state={state} />
      <InsightsBand
        insights={state.insights}
        labelKey="home.section.explore"
        onRefresh={state.refresh}
      >
        {(insights) => <ExploreCards insights={insights} />}
      </InsightsBand>
      <InsightsBand
        insights={state.insights}
        labelKey="home.section.posture"
        onRefresh={state.refresh}
      >
        {(insights) => <PostureCards insights={insights} />}
      </InsightsBand>
    </>
  );
}

function LiveObservationBand({ state }: { state: HomePageState }) {
  const { t } = useI18n();
  const busy = [state.insights, state.overview].some((resource) =>
    resource.phase === "idle" || resource.phase === "loading" ||
    (resource.phase === "ready" && resource.refreshing)
  );
  return (
    <Surface
      aria-busy={busy || undefined}
      aria-labelledby="home-live-observation-title"
      className="grid min-w-0 overflow-hidden"
    >
      <BandHeader id="home-live-observation-title" title={t("home.section.liveObservation")} />
      <div className="grid min-w-0 gap-4 p-4 lg:grid-cols-2">
        <TopologyPreview onRetry={state.refresh} state={state.insights} />
        <TimelinePreview onRetry={state.refresh} state={state.overview} />
      </div>
    </Surface>
  );
}

function TopologyPreview({
  onRetry,
  state,
}: {
  onRetry: () => void;
  state: HomePageState["insights"];
}) {
  const filter = useUnifiedFilter();
  const { formatNumber, t } = useI18n();
  if (state.phase === "idle" || state.phase === "loading") {
    return <HomeSectionLoading label={t("home.source.topology")} />;
  }
  if (state.phase === "failed") {
    return (
      <HomeSectionFailure
        failure={state.failure}
        label={t("home.source.topology")}
        onRetry={onRetry}
      />
    );
  }
  const summary = state.data.topology;
  const detail = createEmptyProductDetailQuery();
  detail.resourceTopologyView = "relations";
  const href = filter.navigationHref(routeDefinitionForSurface("resources").path, detail);
  return (
    <EvidenceCard
      href={href}
      icon={<Network aria-hidden="true" />}
      linkLabel={t("home.source.openTopology")}
      title={t("home.source.topology")}
    >
      {summary.coverage.availability === "unavailable" ? (
        <UnavailableEvidence />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("home.source.topologySummary", {
            edges: formatNumber(summary.edgeCount ?? 0),
            nodes: formatNumber(summary.nodeCount ?? 0),
          })}
        </p>
      )}
    </EvidenceCard>
  );
}

function TimelinePreview({
  onRetry,
  state,
}: {
  onRetry: () => void;
  state: HomePageState["overview"];
}) {
  const filter = useUnifiedFilter();
  const { t } = useI18n();
  if (state.phase === "idle" || state.phase === "loading") {
    return <HomeSectionLoading label={t("home.source.timeline")} />;
  }
  if (state.phase === "failed") {
    return (
      <HomeSectionFailure
        failure={state.failure}
        label={t("home.source.timeline")}
        onRetry={onRetry}
      />
    );
  }
  const href = filter.navigationHref(routeDefinitionForSurface("timeline").path);
  return (
    <EvidenceCard
      href={href}
      icon={<Activity aria-hidden="true" />}
      linkLabel={t("home.source.openTimeline")}
      title={t("home.source.timeline")}
    >
      {state.data.warnings.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("home.source.timelineEmpty")}</p>
      ) : (
        <ul className="grid min-w-0 gap-2">
          {state.data.warnings.slice(0, 6).map((warning) => (
            <li className="min-w-0 rounded-lg border px-3 py-2" key={warning.id}>
              <span className="block truncate text-sm font-medium">
                {warning.reason ?? warning.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {warning.namespace ?? t("home.insights.clusterScoped")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </EvidenceCard>
  );
}

function InsightsBand({
  children,
  insights,
  labelKey,
  onRefresh,
}: {
  children: (insights: HomeInsights) => ReactNode;
  insights: HomeResourceState<HomeInsights>;
  labelKey: "home.section.explore" | "home.section.posture";
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const label = t(labelKey);
  const busy = insights.phase === "idle" || insights.phase === "loading" ||
    (insights.phase === "ready" && insights.refreshing);
  return (
    <Surface
      aria-busy={busy || undefined}
      aria-labelledby={`${labelKey}-title`}
      className="grid min-w-0 overflow-hidden"
    >
      <BandHeader id={`${labelKey}-title`} title={label} />
      {insights.phase === "idle" || insights.phase === "loading" ? (
        <HomeSectionLoading label={label} />
      ) : insights.phase === "failed" ? (
        <HomeSectionFailure failure={insights.failure} label={label} onRetry={onRefresh} />
      ) : (
        <>
          <HomeRefreshFailure
            failure={insights.refreshFailure}
            label={label}
            onRetry={onRefresh}
          />
          <div className="grid min-w-0 gap-4 p-4 lg:grid-cols-2">
            {children(insights.data)}
          </div>
        </>
      )}
    </Surface>
  );
}

function ExploreCards({ insights }: { insights: HomeInsights }) {
  return (
    <>
      {insights.helm.coverage.availability === "unavailable" ? null : (
        <HelmSummaryCard insights={insights} />
      )}
      {insights.explore.traffic.coverage.availability === "unavailable" ? null : (
        <ProviderCard kind="traffic" />
      )}
      {insights.explore.cost.coverage.availability === "unavailable" ? null : (
        <ProviderCard kind="cost" />
      )}
    </>
  );
}

function ProviderCard({ kind }: { kind: "traffic" | "cost" }) {
  const filter = useUnifiedFilter();
  const { t } = useI18n();
  const href = filter.navigationHref(routeDefinitionForSurface(kind).path);
  return (
    <EvidenceCard
      href={href}
      icon={<Activity aria-hidden="true" />}
      linkLabel={t(kind === "traffic" ? "home.source.openTraffic" : "home.source.openCost")}
      title={t(kind === "traffic" ? "home.source.traffic" : "home.source.cost")}
    />
  );
}

function PostureCards({ insights }: { insights: HomeInsights }) {
  return (
    <>
      <CertificateExpiryCard insights={insights} />
      {insights.posture.gitops.coverage.availability === "unavailable" ? null : (
        <GitOpsCard insights={insights} />
      )}
      {insights.posture.audit.coverage.availability === "unavailable" ? null : (
        <AuditCard insights={insights} />
      )}
      {insights.posture.networkPolicy.coverage.availability === "unavailable" ? null : (
        <NetworkPolicyCard insights={insights} />
      )}
    </>
  );
}

function GitOpsCard({ insights }: { insights: HomeInsights }) {
  const filter = useUnifiedFilter();
  const { formatNumber, t } = useI18n();
  const summary = insights.posture.gitops;
  return (
    <EvidenceCard
      href={filter.navigationHref(routeDefinitionForSurface("gitops").path)}
      icon={<GitBranch aria-hidden="true" />}
      linkLabel={t("home.source.openGitOps")}
      title={t("home.source.gitops")}
    >
      <EvidenceMetric
        label={t("home.source.controllers")}
        value={formatNumber(summary.controllerCount ?? 0)}
      />
    </EvidenceCard>
  );
}

function AuditCard({ insights }: { insights: HomeInsights }) {
  const filter = useUnifiedFilter();
  const { formatNumber, t } = useI18n();
  const summary = insights.posture.audit;
  return (
    <EvidenceCard
      href={filter.navigationHref(routeDefinitionForSurface("checks").path)}
      icon={<BadgeCheck aria-hidden="true" />}
      linkLabel={t("home.source.openChecks")}
      title={t("home.source.audit")}
    >
      <div className="grid grid-cols-2 gap-3">
        <EvidenceMetric
          label={t("home.source.checks")}
          value={formatNumber(summary.totalCheckCount ?? 0)}
        />
        <EvidenceMetric
          label={t("home.source.findings")}
          value={formatNumber(summary.totalFindingCount ?? 0)}
        />
      </div>
    </EvidenceCard>
  );
}

function NetworkPolicyCard({ insights }: { insights: HomeInsights }) {
  const { formatNumber, t } = useI18n();
  const summary = insights.posture.networkPolicy;
  return (
    <Card className="min-w-0">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{t("home.source.networkPolicy")}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <EvidenceMetric
          label={t("home.source.coveredWorkloads")}
          value={t("home.source.coverageValue", {
            covered: formatNumber(summary.coveredWorkloads ?? 0),
            total: formatNumber(summary.totalWorkloads ?? 0),
          })}
        />
      </CardContent>
    </Card>
  );
}

function EvidenceCard({
  children,
  href,
  icon,
  linkLabel,
  title,
}: {
  children?: ReactNode;
  href: string;
  icon: ReactNode;
  linkLabel: string;
  title: string;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="border-b">
        <CardTitle className="flex min-w-0 items-center gap-2">
          <span className="size-4 shrink-0 [&>svg]:size-4">{icon}</span>
          <span className="truncate">{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        {children}
        <a className={buttonVariants({ variant: "outline" })} href={href}>
          {linkLabel}<ExternalLink aria-hidden="true" />
        </a>
      </CardContent>
    </Card>
  );
}

function EvidenceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-lg bg-muted/50 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className="truncate text-xl font-semibold">{value}</strong>
    </div>
  );
}

function UnavailableEvidence() {
  const { t } = useI18n();
  return <p className="text-sm text-muted-foreground">{t("home.insights.unavailable")}</p>;
}

function BandHeader({ id, title }: { id: string; title: string }) {
  return (
    <div className="flex min-h-16 items-center border-b p-4">
      <h2 className="truncate text-base font-semibold" id={id}>{title}</h2>
    </div>
  );
}
