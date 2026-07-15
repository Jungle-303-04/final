import { ArrowLeft, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { useI18n } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui/primitives/tabs";
import type { UnifiedFilterController } from "../filters/filterContract";
import { ApplicationDeploymentsPanel } from "./ApplicationDeploymentsPanel";
import {
  ApplicationIncidentsPanel,
  ApplicationHistoryPanel,
  ApplicationOverviewPanel,
  ApplicationResourcesPanel,
} from "./ApplicationDetailPanels";
import { ApplicationDriftPanel } from "./ApplicationDriftPanel";
import { ApplicationTopologyPanel } from "./ApplicationTopologyPanel";
import { ApplicationsFailureState } from "./ApplicationsState";
import {
  applicationGitOpsChangeHref,
  applicationOwnedSurfaceHref,
} from "./applicationFilters";
import { applicationsCopy } from "../../shared/i18n/applicationSurfaceCopy";
import type { ApplicationsPort } from "./applicationsContract";
import {
  useApplicationDeployments,
  useApplicationDetail,
  useApplicationDrift,
} from "./useApplicationsData";

const APPLICATION_TABS = ["overview", "topology", "history", "resources", "deployments", "drift", "incidents"] as const;
type ApplicationTab = (typeof APPLICATION_TABS)[number];

export function ApplicationDetailWorkspace({
  applicationId,
  filter,
  port,
}: {
  applicationId: string;
  filter: UnifiedFilterController;
  port: ApplicationsPort;
}) {
  const { locale } = useI18n();
  const copy = applicationsCopy(locale);
  const activeTab = applicationTab(filter.detail.tab);
  const [detail, refreshDetail] = useApplicationDetail(port, applicationId);
  const [deployments, refreshDeployments] = useApplicationDeployments(
    port,
    applicationId,
    activeTab === "deployments",
  );
  const [drift, refreshDrift] = useApplicationDrift(port, applicationId, activeTab === "drift");
  const links = useMemo(() => ({
    resources: applicationOwnedSurfaceHref("/resources", filter.state, applicationId),
    issues: applicationOwnedSurfaceHref("/issues", filter.state, applicationId),
  }), [applicationId, filter.state]);

  if (detail.phase === "loading") return <ProductStateScreen kind="loading" placement="content" />;
  if (detail.phase === "failed") return <ApplicationsFailureState failure={detail.failure} onRetry={refreshDetail} />;
  if (detail.data === null) return <ProductStateScreen kind="empty" placement="content" />;

  const application = detail.data;
  return (
    <ProductPageFrame>
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Button aria-label={copy.back} onClick={() => closeDetail(filter)} size="icon" type="button" variant="outline">
            <ArrowLeft aria-hidden="true" />
          </Button>
          <div className="grid min-w-0 gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-2xl font-semibold tracking-tight">{application.name}</h2>
              {application.environments.map((environment) => <Badge key={environment} variant="outline">{environment}</Badge>)}
            </div>
            <p className="min-w-0 text-sm text-muted-foreground">
              <OverflowIdentity value={application.id} />
            </p>
          </div>
        </div>
        <Button aria-label={copy.refresh} disabled={detail.refreshing} onClick={refreshDetail} size="icon" type="button" variant="outline">
          <RefreshCw aria-hidden="true" className={detail.refreshing ? "motion-safe:animate-spin" : undefined} />
        </Button>
      </header>
      <Tabs
        onValueChange={(value) => {
          if (value !== null && isApplicationTab(value)) {
            filter.updateDetail((current) => ({ ...current, tab: value }), "detail-tab");
          }
        }}
        value={activeTab}
      >
        <TabsList aria-label={copy.details} className="max-w-full overflow-x-auto" variant="line">
          <TabsTrigger value="overview">{copy.overview}</TabsTrigger>
          <TabsTrigger value="topology">{copy.topology}</TabsTrigger>
          <TabsTrigger value="history">{copy.history}</TabsTrigger>
          <TabsTrigger value="resources">{copy.resources}</TabsTrigger>
          <TabsTrigger value="deployments">{copy.deployments}</TabsTrigger>
          <TabsTrigger value="drift">{copy.differences}</TabsTrigger>
          <TabsTrigger value="incidents">{copy.incidents}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><ApplicationOverviewPanel detail={application} /></TabsContent>
        <TabsContent value="topology"><ApplicationTopologyPanel topology={application.topology} /></TabsContent>
        <TabsContent value="history"><ApplicationHistoryPanel history={application.history} /></TabsContent>
        <TabsContent value="resources"><ApplicationResourcesPanel detail={application} href={links.resources} /></TabsContent>
        <TabsContent value="deployments">
          <ApplicationDeploymentsPanel
            hrefForChange={(changeId) => applicationGitOpsChangeHref(filter.state, changeId)}
            resource={deployments}
            retry={refreshDeployments}
          />
        </TabsContent>
        <TabsContent value="drift"><ApplicationDriftPanel resource={drift} retry={refreshDrift} /></TabsContent>
        <TabsContent value="incidents"><ApplicationIncidentsPanel detail={application} href={links.issues} /></TabsContent>
      </Tabs>
    </ProductPageFrame>
  );
}

export function openApplicationDetail(filter: UnifiedFilterController, applicationId: string): void {
  filter.updateDetail((current) => ({
    ...current,
    application: applicationId,
    tab: "overview",
  }), "detail-open");
}

function closeDetail(filter: UnifiedFilterController): void {
  filter.updateDetail((current) => ({
    ...current,
    application: null,
    tab: null,
  }), "detail-close");
}

function applicationTab(value: string | null): ApplicationTab {
  return value !== null && isApplicationTab(value) ? value : "overview";
}

function isApplicationTab(value: string): value is ApplicationTab {
  return APPLICATION_TABS.some((tab) => tab === value);
}
