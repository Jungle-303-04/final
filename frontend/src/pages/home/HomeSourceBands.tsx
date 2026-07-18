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
import { Surface, SurfaceSection } from "../../shared/ui/Surface";
import { buttonVariants } from "../../shared/ui/primitives/button";
import {
  CertificateExpirySection,
  HelmSummarySection,
  HomeInsightSection,
} from "./HomeInsightsBand";
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
        {(insights) => <ExploreSections insights={insights} />}
      </InsightsBand>
      <InsightsBand
        insights={state.insights}
        labelKey="home.section.posture"
        onRefresh={state.refresh}
      >
        {(insights) => <PostureSections insights={insights} />}
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
      <SurfaceSection className={HOME_SECTION_GRID_CLASS_NAME}>
        <TopologyPreview onRetry={state.refresh} state={state.insights} />
        <TimelinePreview onRetry={state.refresh} state={state.overview} />
      </SurfaceSection>
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
    <EvidenceSection
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
    </EvidenceSection>
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
    <EvidenceSection
      href={href}
      icon={<Activity aria-hidden="true" />}
      linkLabel={t("home.source.openTimeline")}
      title={t("home.source.timeline")}
    >
      {state.data.warnings.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("home.source.timelineEmpty")}</p>
      ) : (
        <ul className="min-w-0 divide-y border-y">
          {state.data.warnings.slice(0, 6).map((warning) => (
            <li className="min-w-0 py-3" key={warning.id}>
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
    </EvidenceSection>
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
          <SurfaceSection className={HOME_SECTION_GRID_CLASS_NAME}>
            {children(insights.data)}
          </SurfaceSection>
        </>
      )}
    </Surface>
  );
}

function ExploreSections({ insights }: { insights: HomeInsights }) {
  return (
    <>
      {insights.helm.coverage.availability === "unavailable" ? null : (
        <HelmSummarySection insights={insights} />
      )}
      {insights.explore.traffic.coverage.availability === "unavailable" ? null : (
        <ProviderSection kind="traffic" />
      )}
      {insights.explore.cost.coverage.availability === "unavailable" ? null : (
        <ProviderSection kind="cost" />
      )}
    </>
  );
}

function ProviderSection({ kind }: { kind: "traffic" | "cost" }) {
  const filter = useUnifiedFilter();
  const { t } = useI18n();
  const href = filter.navigationHref(routeDefinitionForSurface(kind).path);
  return (
    <EvidenceSection
      href={href}
      icon={<Activity aria-hidden="true" />}
      linkLabel={t(kind === "traffic" ? "home.source.openTraffic" : "home.source.openCost")}
      title={t(kind === "traffic" ? "home.source.traffic" : "home.source.cost")}
    />
  );
}

function PostureSections({ insights }: { insights: HomeInsights }) {
  return (
    <>
      <CertificateExpirySection insights={insights} />
      {insights.posture.gitops.coverage.availability === "unavailable" ? null : (
        <GitOpsSection insights={insights} />
      )}
      {insights.posture.audit.coverage.availability === "unavailable" ? null : (
        <AuditSection insights={insights} />
      )}
      {insights.posture.networkPolicy.coverage.availability === "unavailable" ? null : (
        <NetworkPolicySection insights={insights} />
      )}
    </>
  );
}

function GitOpsSection({ insights }: { insights: HomeInsights }) {
  const filter = useUnifiedFilter();
  const { formatNumber, t } = useI18n();
  const summary = insights.posture.gitops;
  return (
    <EvidenceSection
      href={filter.navigationHref(routeDefinitionForSurface("gitops").path)}
      icon={<GitBranch aria-hidden="true" />}
      linkLabel={t("home.source.openGitOps")}
      title={t("home.source.gitops")}
    >
      <EvidenceMetric
        label={t("home.source.controllers")}
        value={formatNumber(summary.controllerCount ?? 0)}
      />
    </EvidenceSection>
  );
}

function AuditSection({ insights }: { insights: HomeInsights }) {
  const filter = useUnifiedFilter();
  const { formatNumber, t } = useI18n();
  const summary = insights.posture.audit;
  return (
    <EvidenceSection
      href={filter.navigationHref(routeDefinitionForSurface("checks").path)}
      icon={<BadgeCheck aria-hidden="true" />}
      linkLabel={t("home.source.openChecks")}
      title={t("home.source.audit")}
    >
      <div className="grid grid-cols-2 [&>*:nth-child(even)]:border-l [&>*:nth-child(even)]:pl-4 [&>*:nth-child(odd)]:pr-4">
        <EvidenceMetric
          label={t("home.source.checks")}
          value={formatNumber(summary.totalCheckCount ?? 0)}
        />
        <EvidenceMetric
          label={t("home.source.findings")}
          value={formatNumber(summary.totalFindingCount ?? 0)}
        />
      </div>
    </EvidenceSection>
  );
}

function NetworkPolicySection({ insights }: { insights: HomeInsights }) {
  const { formatNumber, t } = useI18n();
  const summary = insights.posture.networkPolicy;
  return (
    <HomeInsightSection
      icon={<ShieldCheck aria-hidden="true" />}
      title={t("home.source.networkPolicy")}
    >
      <EvidenceMetric
        label={t("home.source.coveredWorkloads")}
        value={t("home.source.coverageValue", {
          covered: formatNumber(summary.coveredWorkloads ?? 0),
          total: formatNumber(summary.totalWorkloads ?? 0),
        })}
      />
    </HomeInsightSection>
  );
}

function EvidenceSection({
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
    <HomeInsightSection icon={icon} title={title}>
      {children}
      <a className={buttonVariants({ variant: "outline" })} href={href}>
        {linkLabel}<ExternalLink aria-hidden="true" />
      </a>
    </HomeInsightSection>
  );
}

function EvidenceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className="truncate text-xl font-semibold tabular-nums" title={value}>{value}</strong>
    </div>
  );
}

const HOME_SECTION_GRID_CLASS_NAME = [
  "grid min-w-0",
  "[&>*]:p-4 [&>*+*]:border-t",
  "lg:grid-cols-2 lg:[&>*+*]:border-t-0",
  "lg:[&>*:nth-child(even)]:border-l",
  "lg:[&>*:nth-child(n+3)]:border-t",
].join(" ");

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
