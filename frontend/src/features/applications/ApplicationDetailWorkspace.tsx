import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useI18n } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../shared/ui/primitives/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui/primitives/tabs";
import type { UnifiedFilterController } from "../filters/filterContract";
import { ApplicationDeploymentsPanel } from "./ApplicationDeploymentsPanel";
import {
  ApplicationIncidentsPanel,
  ApplicationHistoryPanel,
  ApplicationOverviewPanel,
  ApplicationResourcesPanel,
  ApplicationUnavailableEvidencePanel,
  ApplicationWorkloadOverviewPanel,
} from "./ApplicationDetailPanels";
import { ApplicationDriftPanel } from "./ApplicationDriftPanel";
import { ApplicationTopologyPanel } from "./ApplicationTopologyPanel";
import { ApplicationsFailureState } from "./ApplicationsState";
import {
  applicationGitOpsChangeHref,
  applicationOwnedSurfaceHref,
} from "./applicationFilters";
import { applicationsCopy } from "../../shared/i18n/applicationSurfaceCopy";
import type {
  ApplicationDetailScope,
  ApplicationInstanceScope,
  ApplicationsPort,
} from "./applicationsContract";
import {
  useApplicationDeployments,
  useApplicationDetail,
  useApplicationDrift,
} from "./useApplicationsData";

const APPLICATION_TABS = ["overview", "topology", "history", "resources", "deployments", "drift", "incidents"] as const;
type ApplicationTab = (typeof APPLICATION_TABS)[number];
const APPLICATION_SCOPE_VALUE = "__application__";

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
  const requestedInstanceId = filter.detail.applicationInstance ?? null;
  const requestedWorkloadKey = filter.detail.applicationWorkload ?? null;
  const [detail, refreshDetail] = useApplicationDetail(
    port,
    applicationId,
    requestedInstanceId,
    requestedWorkloadKey,
  );
  const workloadSelected = detail.phase === "ready" && detail.data?.scope.selectedScope === "workload";
  const [deployments, refreshDeployments] = useApplicationDeployments(
    port,
    applicationId,
    activeTab === "deployments" && !workloadSelected,
    requestedInstanceId,
  );
  const [drift, refreshDrift] = useApplicationDrift(
    port,
    applicationId,
    activeTab === "drift" && !workloadSelected,
    requestedInstanceId,
  );
  const links = useMemo(() => ({
    resources: applicationOwnedSurfaceHref("/resources", filter.state, applicationId),
    issues: applicationOwnedSurfaceHref("/issues", filter.state, applicationId),
  }), [applicationId, filter.state]);
  const selectedInstanceId = detail.phase === "ready"
    ? detail.data?.scope.selectedInstanceId ?? null
    : null;

  useEffect(() => {
    if (requestedInstanceId !== null || selectedInstanceId === null) return;
    filter.updateDetail((current) => {
      if (current.application !== applicationId || current.applicationInstance === selectedInstanceId) {
        return current;
      }
      return { ...current, applicationInstance: selectedInstanceId };
    }, "detail-instance-default");
  }, [applicationId, filter, requestedInstanceId, selectedInstanceId]);

  const selectedWorkloadKey = detail.phase === "ready"
    ? detail.data?.scope.workloadScope.selectedWorkloadKey ?? null
    : null;
  const selectedScope = detail.phase === "ready" ? detail.data?.scope.selectedScope : "application";
  const workloadRecovery = detail.phase === "ready" &&
    detail.data?.scope.workloadScope.partialReasonCodes.includes("requested_workload_unavailable") === true;

  useEffect(() => {
    if (selectedScope === "workload" && requestedWorkloadKey === null && selectedWorkloadKey !== null) {
      filter.updateDetail((current) => current.application !== applicationId
        ? current
        : { ...current, applicationWorkload: selectedWorkloadKey }, "detail-workload-default");
      return;
    }
    if (requestedWorkloadKey !== null && selectedScope === "application" && workloadRecovery) {
      filter.updateDetail((current) => current.application !== applicationId
        ? current
        : { ...current, applicationWorkload: null }, "detail-workload-recovery");
    }
  }, [
    applicationId,
    filter,
    requestedWorkloadKey,
    selectedScope,
    selectedWorkloadKey,
    workloadRecovery,
  ]);

  if (detail.phase === "loading") return <ProductStateScreen kind="loading" placement="content" />;
  if (detail.phase === "failed") return <ApplicationsFailureState failure={detail.failure} onRetry={refreshDetail} />;
  if (detail.data === null) return <ProductStateScreen kind="empty" placement="content" />;

  const application = detail.data;
  const isWorkloadScope = application.scope.selectedScope === "workload";
  const workload = application.workload;
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
            <ApplicationInstanceScopePicker
              applicationId={applicationId}
              copy={copy}
              filter={filter}
              instances={application.scope.instances}
              selectedInstanceId={application.scope.selectedInstanceId}
              unavailable={application.scope.availability === "unavailable"}
            />
            <ApplicationWorkloadScopePicker
              applicationId={applicationId}
              copy={copy}
              filter={filter}
              scope={application.scope}
            />
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
          {!isWorkloadScope ? <>
            <TabsTrigger value="resources">{copy.resources}</TabsTrigger>
            <TabsTrigger value="deployments">{copy.deployments}</TabsTrigger>
            <TabsTrigger value="drift">{copy.differences}</TabsTrigger>
            <TabsTrigger value="incidents">{copy.incidents}</TabsTrigger>
          </> : null}
        </TabsList>
        <TabsContent value="overview">
          {isWorkloadScope && workload !== null
            ? <ApplicationWorkloadOverviewPanel workload={workload} />
            : <ApplicationOverviewPanel detail={application} />}
        </TabsContent>
        <TabsContent value="topology">
          <ApplicationTopologyPanel topology={isWorkloadScope && workload !== null ? workload.topology : application.topology} />
        </TabsContent>
        <TabsContent value="history">
          {isWorkloadScope && workload !== null
            ? <ApplicationUnavailableEvidencePanel evidence={workload.history} title={copy.history} />
            : <ApplicationHistoryPanel history={application.history} />}
        </TabsContent>
        {!isWorkloadScope ? <>
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
        </> : null}
      </Tabs>
    </ProductPageFrame>
  );
}

export function openApplicationDetail(filter: UnifiedFilterController, applicationId: string): void {
  filter.updateDetail((current) => ({
    ...current,
    application: applicationId,
    applicationInstance: null,
    applicationWorkload: null,
    tab: "overview",
  }), "detail-open");
}

function closeDetail(filter: UnifiedFilterController): void {
  filter.updateDetail((current) => ({
    ...current,
    application: null,
    applicationInstance: null,
    applicationWorkload: null,
    tab: null,
  }), "detail-close");
}

function applicationTab(value: string | null): ApplicationTab {
  return value !== null && isApplicationTab(value) ? value : "overview";
}

function isApplicationTab(value: string): value is ApplicationTab {
  return APPLICATION_TABS.some((tab) => tab === value);
}

function ApplicationInstanceScopePicker({
  applicationId,
  copy,
  filter,
  instances,
  selectedInstanceId,
  unavailable,
}: {
  applicationId: string;
  copy: ReturnType<typeof applicationsCopy>;
  filter: UnifiedFilterController;
  instances: readonly ApplicationInstanceScope[];
  selectedInstanceId: string | null;
  unavailable: boolean;
}) {
  if (unavailable || selectedInstanceId === null) {
    return <p className="text-xs text-muted-foreground">{copy.scopeUnavailable}</p>;
  }

  return (
    <Select
      items={instances.map((instance) => ({ label: instance.environment, value: instance.id }))}
      onValueChange={(instanceId) => {
        if (instanceId === null || instanceId === selectedInstanceId) return;
        filter.updateDetail((current) => current.application !== applicationId
          ? current
          : { ...current, applicationInstance: instanceId, applicationWorkload: null }, "detail-instance");
      }}
      value={selectedInstanceId}
    >
      <SelectTrigger aria-label={copy.instanceScope} className="max-w-full" size="sm">
        <SelectValue className="truncate" />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false} className="max-w-[min(32rem,calc(100vw-2rem))]">
        <SelectGroup>
          <SelectLabel>{copy.instanceScope}</SelectLabel>
          {instances.map((instance) => (
            <SelectItem key={instance.id} value={instance.id}>
              <span className="flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden">
                <span className="truncate">{instance.environment}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {instance.scope.clusterId}{formatNamespaces(instance.scope.namespaces)} · {freshnessLabel(copy, instance.scope.freshness)}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ApplicationWorkloadScopePicker({
  applicationId,
  copy,
  filter,
  scope,
}: {
  applicationId: string;
  copy: ReturnType<typeof applicationsCopy>;
  filter: UnifiedFilterController;
  scope: ApplicationDetailScope;
}) {
  const workloadScope = scope.workloadScope;
  if (workloadScope.availability === "unavailable") return null;
  const selectedValue = scope.selectedScope === "workload"
    ? workloadScope.selectedWorkloadKey
    : APPLICATION_SCOPE_VALUE;
  if (selectedValue === null) return null;
  const items = [
    ...(workloadScope.applicationScopeAvailable
      ? [{ label: copy.applicationScope, value: APPLICATION_SCOPE_VALUE }]
      : []),
    ...workloadScope.workloads.map((workload) => ({
      label: `${workload.resource.kind}/${workload.resource.name}`,
      value: workload.key,
    })),
  ];
  if (items.length === 0) return null;
  return (
    <Select
      items={items}
      onValueChange={(value) => {
        if (value === null || value === selectedValue) return;
        filter.updateDetail((current) => current.application !== applicationId
          ? current
          : {
            ...current,
            applicationWorkload: value === APPLICATION_SCOPE_VALUE ? null : value,
            tab: "overview",
          }, "detail-workload");
      }}
      value={selectedValue}
    >
      <SelectTrigger aria-label={copy.workloadScope} className="max-w-full" size="sm">
        <SelectValue className="truncate" />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false} className="max-w-[min(32rem,calc(100vw-2rem))]">
        <SelectGroup>
          <SelectLabel>{copy.workloadScope}</SelectLabel>
          {workloadScope.applicationScopeAvailable ? (
            <SelectItem value={APPLICATION_SCOPE_VALUE}>{copy.applicationScope}</SelectItem>
          ) : null}
          {workloadScope.workloads.map((workload) => (
            <SelectItem key={workload.key} value={workload.key}>
              <span className="flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden">
                <span className="truncate">{workload.resource.kind}/{workload.resource.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {workload.scope.clusterId}{formatNamespaces(workload.scope.namespaces)}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function formatNamespaces(namespaces: readonly string[]): string {
  return namespaces.length === 0 ? "" : `/${namespaces.join(",")}`;
}

function freshnessLabel(
  copy: ReturnType<typeof applicationsCopy>,
  freshness: ApplicationInstanceScope["scope"]["freshness"],
): string {
  switch (freshness) {
    case "live": return copy.scopeLive;
    case "stale": return copy.scopeStale;
    case "partial": return copy.scopePartial;
    case "disconnected": return copy.scopeDisconnected;
  }
}
