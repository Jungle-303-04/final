import type { MessageKey, TranslationFunction } from "../../shared/i18n";
import { useI18n } from "../../shared/i18n";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Collapse, CollapseChevron } from "../../shared/ui/primitives/collapse";
import { Input } from "../../shared/ui/primitives/input";
import { Progress } from "../../shared/ui/primitives/progress";
import type {
  ProviderCondition,
  ProviderResourceDetail,
} from "../../features/resources/providerResourceContract";
import { DefinitionGrid } from "./ResourceFactsPanel";
import { useMemo, useState } from "react";

interface ProviderSection {
  id: string;
  label: MessageKey;
  rows: Array<[MessageKey, string | null]>;
}

export function ProviderResourceDetailPanel({ detail }: { detail: ProviderResourceDetail }) {
  const { t } = useI18n();
  const sections = providerSections(detail, t)
    .map((section) => ({
      ...section,
      rows: section.rows.filter((row): row is [MessageKey, string] => row[1] !== null),
    }))
    .filter((section) => section.rows.length > 0);
  return (
    <section
      aria-labelledby="resource-provider-detail-title"
      className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs"
      data-provider-detail={detail.type}
    >
      <h3 className="font-heading font-medium" id="resource-provider-detail-title">
        {t("resources.detail.provider.title")}
      </h3>
      {sections.map((section) => (
        <section aria-labelledby={`provider-section-${section.id}`} className="grid gap-2" key={section.id}>
          <h4 className="text-sm font-medium" id={`provider-section-${section.id}`}>
            {t(section.label)}
          </h4>
          <DefinitionGrid entries={section.rows.map(([label, value]) => [t(label), value])} />
        </section>
      ))}
      {detail.type === "cluster-compliance-report" ? (
        <ComplianceControlsPanel detail={detail} />
      ) : null}
      {detail.conditions.length > 0 ? <ProviderConditions conditions={detail.conditions} /> : null}
    </section>
  );
}

type ComplianceDetail = Extract<ProviderResourceDetail, { type: "cluster-compliance-report" }>;

function ComplianceControlsPanel({ detail }: { detail: ComplianceDetail }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const controls = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return detail.controls.filter((control) => {
      if (failedOnly && (control.totalFail ?? 0) === 0) return false;
      if (!normalized) return true;
      return [control.id, control.name, control.description]
        .filter((value): value is string => value !== null)
        .some((value) => value.toLocaleLowerCase().includes(normalized));
    });
  }, [detail.controls, failedOnly, query]);
  const total = (detail.passCount ?? 0) + (detail.failCount ?? 0);
  const compliance = total > 0 && detail.passCount !== null
    ? Math.round((detail.passCount / total) * 100)
    : null;
  if (detail.controls.length === 0) return null;
  return (
    <section aria-labelledby="provider-compliance-controls" className="grid gap-3">
      <div className="grid gap-2">
        <h4 className="text-sm font-medium" id="provider-compliance-controls">
          {t("resources.detail.provider.controls")}
        </h4>
        {compliance === null ? null : (
          <Progress
            aria-label={t("resources.detail.provider.compliance")}
            value={compliance}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <Input
          aria-label={t("resources.detail.provider.controlSearch")}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("resources.detail.provider.controlSearchPlaceholder")}
          type="search"
          value={query}
        />
        <Button
          aria-pressed={failedOnly}
          onClick={() => setFailedOnly((value) => !value)}
          size="sm"
          type="button"
          variant={failedOnly ? "secondary" : "outline"}
        >
          {t("resources.detail.provider.failedOnly")}
        </Button>
      </div>
      {query || failedOnly ? (
        <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{t("resources.detail.provider.controlResults", {
            count: controls.length,
            total: detail.controls.length,
          })}</span>
          <Button
            onClick={() => { setQuery(""); setFailedOnly(false); }}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("resources.detail.provider.clearFilters")}
          </Button>
        </div>
      ) : null}
      {controls.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          {t("resources.detail.provider.noControlResults")}
        </p>
      ) : (
        <ul className="grid gap-2">
          {controls.map((control, index) => {
            const open = expanded.has(control.id);
            const failed = (control.totalFail ?? 0) > 0;
            const contentId = `provider-control-${index}-${safeId(control.id)}`;
            return (
              <li className="min-w-0 rounded-lg border bg-background/65" key={control.id}>
                <button
                  aria-controls={contentId}
                  aria-expanded={open}
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left"
                  onClick={() => setExpanded((current) => toggleSet(current, control.id))}
                  type="button"
                >
                  <CollapseChevron className="size-4" open={open} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {control.name ?? control.id}
                  </span>
                  {control.severity ? <Badge variant="outline">{control.severity}</Badge> : null}
                  <StatusMark
                    label={failed
                      ? t("resources.detail.provider.controlFailed")
                      : t("resources.detail.provider.controlPassed")}
                    tone={failed ? "critical" : "healthy"}
                  />
                </button>
                <Collapse mountLazily open={open}>
                  <div className="grid gap-2 border-t px-3 py-3" id={contentId}>
                    <DefinitionGrid entries={[
                      [t("resources.detail.provider.controlId"), control.id],
                      ...(control.description
                        ? [[t("resources.detail.provider.description"), control.description] as [string, string]]
                        : []),
                      ...(control.totalPass === null
                        ? []
                        : [[t("resources.detail.provider.passCount"), String(control.totalPass)] as [string, string]]),
                      ...(control.totalFail === null
                        ? []
                        : [[t("resources.detail.provider.failCount"), String(control.totalFail)] as [string, string]]),
                      ...(control.checkIds.length === 0
                        ? []
                        : [[t("resources.detail.provider.checkIds"), control.checkIds.join(" · ")] as [string, string]]),
                    ]} />
                  </div>
                </Collapse>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ProviderConditions({ conditions }: { conditions: ProviderCondition[] }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="provider-conditions-title" className="grid gap-2">
      <h4 className="text-sm font-medium" id="provider-conditions-title">
        {t("resources.detail.provider.conditions")}
      </h4>
      <ul className="grid gap-2">
        {conditions.map((condition) => (
          <li className="grid min-w-0 gap-1 rounded-lg border bg-background/65 px-3 py-2.5" key={condition.type}>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium" title={condition.type}>
                {condition.type}
              </span>
              <StatusMark
                label={condition.reason ?? condition.status}
                tone={condition.status === "True" ? "healthy" : condition.status === "False" ? "critical" : "unknown"}
              />
            </div>
            {condition.message ? (
              <p className="whitespace-pre-wrap text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {condition.message}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function providerSections(
  detail: ProviderResourceDetail,
  t: TranslationFunction,
): ProviderSection[] {
  if (detail.type === "aws-machine") return [
    section("instance", "resources.detail.provider.overview", [
      ["resources.detail.provider.instanceType", detail.instanceType],
      ["resources.detail.provider.instanceId", detail.instanceId],
      ["resources.detail.provider.instanceState", detail.instanceState],
      ["resources.detail.provider.providerId", detail.providerId],
    ]),
    section("configuration", "resources.detail.provider.configuration", [
      ["resources.detail.provider.iamProfile", detail.iamInstanceProfile],
      ["resources.detail.provider.sshKey", detail.sshKeyName],
      ["resources.detail.provider.subnet", detail.subnetId],
      ["resources.detail.provider.secretsBackend", detail.secretsBackend],
    ]),
    section("addresses", "resources.detail.provider.addresses", [
      ["resources.detail.provider.addresses", join(detail.addresses.map((item) => `${item.type}: ${item.address}`))],
    ]),
  ];
  if (detail.type === "aws-managed-cluster") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.endpoint", detail.endpoint],
      ["resources.detail.provider.failureDomains", join(detail.failureDomains)],
    ]),
  ];
  if (detail.type === "aws-managed-control-plane") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.clusterName", detail.clusterName],
      ["resources.detail.provider.region", detail.region],
      ["resources.detail.provider.version", detail.version],
      ["resources.detail.provider.endpointAccess", detail.endpointAccess],
      ["resources.detail.provider.role", detail.roleName],
      ["resources.detail.provider.identity", detail.identity],
    ]),
    section("network", "resources.detail.provider.network", [
      ["resources.detail.provider.vpc", detail.vpcId],
      ["resources.detail.provider.cidr", detail.vpcCidrBlock],
      ["resources.detail.provider.subnets", join(detail.subnets.map(formatAwsSubnet))],
      ["resources.detail.provider.securityGroups", join(detail.securityGroups.map((item) => join([item.role, item.id, item.name])!).filter(Boolean))],
      ["resources.detail.provider.addresses", join(detail.natGatewayIps)],
      ["resources.detail.provider.failureDomains", join(detail.failureDomains)],
    ]),
    section("addons", "resources.detail.provider.addons", [
      ["resources.detail.provider.addons", join(detail.addons.map((item) => join([item.name, item.currentVersion ?? item.requestedVersion, item.status])!).filter(Boolean))],
    ]),
  ];
  if (detail.type === "aws-managed-machine-pool") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.nodeGroup", detail.nodeGroupName],
      ["resources.detail.provider.instanceType", detail.instanceType],
      ["resources.detail.provider.amiType", detail.amiType],
      ["resources.detail.provider.capacityType", detail.capacityType],
      ["resources.detail.provider.role", detail.roleName],
    ]),
    scalingSection(detail.scaling, detail.maxUnavailable),
    section("configuration", "resources.detail.provider.configuration", [
      ["resources.detail.provider.subnets", join(detail.subnetIds)],
      ["resources.detail.provider.labels", join(detail.labels.map(({ key, value }) => `${key}=${value}`))],
    ]),
  ];
  if (detail.type === "azure-machine") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.vmSize", detail.vmSize],
      ["resources.detail.provider.availabilityZone", detail.availabilityZone],
      ["resources.detail.provider.osType", detail.osType],
      ["resources.detail.provider.osDisk", numberWithUnit(detail.osDiskSizeGb, "GB")],
      ["resources.detail.provider.providerId", detail.providerId],
      ["resources.detail.provider.subnet", detail.subnetName],
    ]),
  ];
  if (detail.type === "azure-managed-control-plane") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.location", detail.location],
      ["resources.detail.provider.resourceGroup", detail.resourceGroupName],
      ["resources.detail.provider.version", detail.version],
      ["resources.detail.provider.skuTier", detail.skuTier],
      ["resources.detail.provider.dnsPrefix", detail.dnsPrefix],
      ["resources.detail.provider.subscription", detail.subscriptionId],
    ]),
    section("network", "resources.detail.provider.network", [
      ["resources.detail.provider.networkPlugin", detail.networkPlugin],
      ["resources.detail.provider.networkPolicy", detail.networkPolicy],
      ["resources.detail.provider.privateCluster", yesNo(detail.privateCluster, t)],
      ["resources.detail.provider.dnsServiceIp", detail.dnsServiceIp],
      ["resources.detail.provider.loadBalancerSku", detail.loadBalancerSku],
      ["resources.detail.provider.authorizedRanges", join(detail.authorizedIpRanges)],
    ]),
    section("upgrade", "resources.detail.provider.configuration", [
      ["resources.detail.provider.upgradeChannel", detail.upgradeChannel],
    ]),
  ];
  if (detail.type === "capi-cluster") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.phase", detail.phase],
      ["resources.detail.provider.version", detail.version],
      ["resources.detail.provider.clusterClass", detail.clusterClass],
      ["resources.detail.provider.endpoint", detail.endpoint],
      ["resources.detail.provider.provider", detail.provider],
      ["resources.detail.provider.paused", yesNo(detail.paused, t)],
    ]),
    replicaSection("control-plane", "resources.detail.provider.controlPlane", detail.controlPlane),
    replicaSection("workers", "resources.detail.provider.workers", detail.workers),
    section("references", "resources.detail.provider.references", [
      ["resources.detail.provider.controlPlane", referenceLabel(detail.controlPlaneRef)],
      ["resources.detail.provider.infrastructure", referenceLabel(detail.infrastructureRef)],
    ]),
  ];
  if (detail.type === "capi-kubeadm-control-plane") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.clusterName", detail.clusterName],
      ["resources.detail.provider.version", detail.version],
      ["resources.detail.provider.initialized", yesNo(detail.initialized, t)],
      ["resources.detail.provider.updateStrategy", detail.updateStrategy],
    ]),
    replicaSection("replicas", "resources.detail.provider.scaling", detail.replicas),
    section("configuration", "resources.detail.provider.configuration", [
      ["resources.detail.provider.infrastructure", referenceLabel(detail.infrastructureRef)],
      ["resources.detail.provider.nodeDrainTimeout", detail.nodeDrainTimeout],
      ["resources.detail.provider.volumeDetachTimeout", detail.nodeVolumeDetachTimeout],
      ["resources.detail.provider.deletionTimeout", detail.nodeDeletionTimeout],
      ["resources.detail.provider.certificateSans", join(detail.certificateSans)],
    ]),
    section("remediation", "resources.detail.provider.remediation", [
      ["resources.detail.provider.nodeName", detail.remediationMachine],
      ["resources.detail.provider.retryCount", number(detail.remediationRetryCount)],
      ["resources.detail.provider.timestamp", detail.remediationTimestamp],
    ]),
  ];
  if (detail.type === "capi-machine-deployment") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.phase", detail.phase],
      ["resources.detail.provider.clusterName", detail.clusterName],
      ["resources.detail.provider.version", detail.version],
      ["resources.detail.provider.paused", yesNo(detail.paused, t)],
    ]),
    replicaSection("replicas", "resources.detail.provider.scaling", detail.replicas),
    section("strategy", "resources.detail.provider.strategy", [
      ["resources.detail.provider.strategy", detail.strategyType],
      ["resources.detail.provider.maxSurge", detail.maxSurge],
      ["resources.detail.provider.maxUnavailable", detail.maxUnavailable],
    ]),
    referencesSection(detail.bootstrapRef, detail.infrastructureRef),
  ];
  if (detail.type === "capi-machine-health-check") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.clusterName", detail.clusterName],
      ["resources.detail.provider.expectedMachines", number(detail.expectedMachines)],
      ["resources.detail.provider.currentHealthy", number(detail.currentHealthy)],
      ["resources.detail.provider.remediationsAllowed", number(detail.remediationsAllowed)],
      ["resources.detail.provider.nodeStartupTimeout", detail.nodeStartupTimeout],
      ["resources.detail.provider.maxUnhealthy", detail.maxUnhealthy],
      ["resources.detail.provider.unhealthyRange", detail.unhealthyRange],
    ]),
    section("selector", "resources.detail.provider.selector", [
      ["resources.detail.provider.selector", join(detail.selector.map(({ key, value }) => `${key}=${value}`))],
    ]),
    section("unhealthy", "resources.detail.provider.unhealthyConditions", [
      ["resources.detail.provider.unhealthyConditions", join(detail.unhealthyConditions.map((item) => join([item.type, item.status, item.timeout])!).filter(Boolean))],
      ["resources.detail.provider.remediation", referenceLabel(detail.remediationTemplate)],
    ]),
  ];
  if (detail.type === "capi-machine-pool") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.phase", detail.phase],
      ["resources.detail.provider.clusterName", detail.clusterName],
      ["resources.detail.provider.minReadySeconds", number(detail.minReadySeconds)],
    ]),
    replicaSection("replicas", "resources.detail.provider.scaling", detail.replicas),
    referencesSection(detail.bootstrapRef, detail.infrastructureRef),
  ];
  if (detail.type === "capi-machine") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.phase", detail.phase],
      ["resources.detail.provider.role", detail.role],
      ["resources.detail.provider.clusterName", detail.clusterName],
      ["resources.detail.provider.version", detail.version],
      ["resources.detail.provider.failureDomain", detail.failureDomain],
      ["resources.detail.provider.provider", detail.provider],
    ]),
    section("infrastructure", "resources.detail.provider.infrastructure", [
      ["resources.detail.provider.providerId", detail.providerId],
      ["resources.detail.provider.region", detail.providerRegion],
      ["resources.detail.provider.instanceId", detail.providerInstanceId],
      ["resources.detail.provider.addresses", join(detail.addresses.map((item) => `${item.type}: ${item.address}`))],
    ]),
    section("node", "resources.detail.provider.node", [
      ["resources.detail.provider.nodeName", detail.nodeName],
      ["resources.detail.provider.nodeUid", detail.nodeUid],
      ["resources.detail.provider.osImage", detail.osImage],
      ["resources.detail.provider.architecture", detail.architecture],
      ["resources.detail.provider.kernel", detail.kernelVersion],
      ["resources.detail.provider.containerRuntime", detail.containerRuntimeVersion],
      ["resources.detail.provider.kubelet", detail.kubeletVersion],
    ]),
    referencesSection(detail.bootstrapRef, detail.infrastructureRef),
  ];
  if (detail.type === "capi-machine-set") return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.clusterName", detail.clusterName],
      ["resources.detail.provider.deletePolicy", detail.deletePolicy],
      ["resources.detail.provider.minReadySeconds", number(detail.minReadySeconds)],
    ]),
    replicaSection("replicas", "resources.detail.provider.scaling", detail.replicas),
    referencesSection(detail.bootstrapRef, detail.infrastructureRef),
  ];
  if (detail.type === "certificate") return [
    section("certificate", "resources.detail.provider.certificate", [
      ["resources.detail.provider.statusReady", yesNo(detail.ready, t)],
      ["resources.detail.provider.secretName", detail.secretName],
      ["resources.detail.provider.revision", number(detail.revision)],
      ["resources.detail.provider.isCa", yesNo(detail.isCa, t)],
      ["resources.detail.provider.failedAttempts", number(detail.failedIssuanceAttempts)],
      ["resources.detail.provider.lastFailure", detail.lastFailureTime],
    ]),
    section("validity", "resources.detail.provider.validity", [
      ["resources.detail.provider.duration", detail.duration],
      ["resources.detail.provider.renewBefore", detail.renewBefore],
      ["resources.detail.provider.notBefore", detail.notBefore],
      ["resources.detail.provider.notAfter", detail.notAfter],
      ["resources.detail.provider.renewalTime", detail.renewalTime],
    ]),
    section("private-key", "resources.detail.provider.privateKey", [
      ["resources.detail.provider.algorithm", detail.privateKey?.algorithm ?? null],
      ["resources.detail.provider.size", number(detail.privateKey?.size ?? null)],
      ["resources.detail.provider.encoding", detail.privateKey?.encoding ?? null],
      ["resources.detail.provider.rotationPolicy", detail.privateKey?.rotationPolicy ?? null],
    ]),
    section("certificate-refs", "resources.detail.provider.references", [
      ["resources.detail.provider.dnsNames", join(detail.dnsNames)],
      ["resources.detail.provider.issuer", namedReferenceLabel(detail.issuerRef)],
      ["resources.detail.provider.usages", join(detail.usages)],
    ]),
  ];
  if (detail.type === "certificate-request") return [
    section("request-status", "resources.detail.provider.status", [
      ["resources.detail.provider.statusReady", yesNo(detail.ready, t)],
      ["resources.detail.provider.approved", yesNo(detail.approved, t)],
      ["resources.detail.provider.denied", yesNo(detail.denied, t)],
      ["resources.detail.provider.certificateIssued", yesNo(detail.certificateIssued, t)],
    ]),
    section("request-detail", "resources.detail.provider.configuration", [
      ["resources.detail.provider.duration", detail.duration],
      ["resources.detail.provider.usages", join(detail.usages)],
      ["resources.detail.provider.issuer", namedReferenceLabel(detail.issuerRef)],
      ["resources.detail.provider.ownerCertificate", namedReferenceLabel(detail.ownerCertificate)],
    ]),
  ];
  if (detail.type === "cluster-compliance-report") return [
    section("framework", "resources.detail.provider.complianceFramework", [
      ["resources.detail.provider.framework", detail.frameworkTitle ?? detail.frameworkId],
      ["resources.detail.provider.description", detail.frameworkDescription],
      ["resources.detail.provider.version", detail.frameworkVersion],
      ["resources.detail.provider.platform", detail.platform],
      ["resources.detail.provider.updatedAt", detail.updatedAt],
    ]),
    section("summary", "resources.detail.provider.summary", [
      ["resources.detail.provider.passCount", number(detail.passCount)],
      ["resources.detail.provider.failCount", number(detail.failCount)],
      ["resources.detail.provider.controlCount", number(detail.controls.length)],
    ]),
  ];
  if (detail.type === "crossplane-composite") return [
    section("composite", "resources.detail.provider.composite", [
      ["resources.detail.provider.resourceMode", t(detail.claim
        ? "resources.detail.provider.claim"
        : "resources.detail.provider.compositeResource")],
      ["resources.detail.provider.paused", yesNo(detail.paused, t)],
      ["resources.detail.provider.updateStrategy", detail.compositionUpdatePolicy],
    ]),
    section("composition-refs", "resources.detail.provider.references", [
      ["resources.detail.provider.composition", namedReferenceLabel(detail.compositionRef)],
      ["resources.detail.provider.compositionRevision", namedReferenceLabel(detail.compositionRevisionRef)],
      ["resources.detail.provider.boundResource", namedReferenceLabel(detail.boundResourceRef)],
      ["resources.detail.provider.composedResources", join(detail.composedResourceRefs.map(namedReferenceLabel))],
    ]),
  ];
  if (detail.type === "cron-workflow") return [
    section("schedule", "resources.detail.provider.schedule", [
      ["resources.detail.provider.schedules", join(detail.schedules)],
      ["resources.detail.provider.timezone", detail.timezone],
      ["resources.detail.provider.suspended", yesNo(detail.suspended, t)],
      ["resources.detail.provider.concurrency", detail.concurrencyPolicy],
      ["resources.detail.provider.lastScheduled", detail.lastScheduledTime],
    ]),
    section("workflow-template", "resources.detail.provider.workflowTemplate", [
      ["resources.detail.provider.templateReference", namedReferenceLabel(detail.workflowTemplateRef)],
      ["resources.detail.provider.clusterScope", yesNo(detail.workflowTemplateClusterScope, t)],
      ["resources.detail.provider.entrypoint", detail.entrypoint],
      ["resources.detail.provider.arguments", number(detail.argumentCount)],
      ["resources.detail.provider.templates", number(detail.templateCount)],
    ]),
    section("history", "resources.detail.provider.history", [
      ["resources.detail.provider.successHistory", number(detail.successfulHistoryLimit)],
      ["resources.detail.provider.failedHistory", number(detail.failedHistoryLimit)],
      ["resources.detail.provider.startingDeadline", seconds(detail.startingDeadlineSeconds)],
      ["resources.detail.provider.activeWorkflows", join(detail.activeWorkflows.map(namedReferenceLabel))],
    ]),
  ];
  if (detail.type === "external-secret") return [
    section("sync", "resources.detail.provider.syncStatus", [
      ["resources.detail.provider.statusReady", yesNo(detail.ready, t)],
      ["resources.detail.provider.lastSync", detail.lastSyncTime],
      ["resources.detail.provider.refreshInterval", detail.refreshInterval],
      ["resources.detail.provider.targetSecret", detail.targetName],
      ["resources.detail.provider.syncedVersion", detail.syncedResourceVersion],
      ["resources.detail.provider.binding", detail.bindingName],
    ]),
    section("store", "resources.detail.provider.storeReference", [
      ["resources.detail.provider.storeName", detail.storeName],
      ["resources.detail.provider.storeKind", detail.storeKind],
    ]),
    section("mappings", "resources.detail.provider.secretMappings", [
      ["resources.detail.provider.secretMappings", join(detail.mappings.map(formatSecretMapping))],
      ["resources.detail.provider.dataSources", join(detail.dataSources.map((source) => join([source.type, source.detail])))],
    ]),
    section("target", "resources.detail.provider.targetConfiguration", [
      ["resources.detail.provider.creationPolicy", detail.targetCreationPolicy],
      ["resources.detail.provider.deletionPolicy", detail.targetDeletionPolicy],
      ["resources.detail.provider.templateType", detail.templateType],
      ["resources.detail.provider.engineVersion", detail.templateEngineVersion],
      ["resources.detail.provider.templateLabels", formatKeyValues(detail.templateLabels)],
      ["resources.detail.provider.templateAnnotations", formatKeyValues(detail.templateAnnotations)],
    ]),
  ];
  if (detail.type === "gateway-class") return [
    section("gateway", "resources.detail.provider.gatewayClass", [
      ["resources.detail.provider.controller", detail.controllerName],
      ["resources.detail.provider.description", detail.description],
      ["resources.detail.provider.accepted", yesNo(detail.accepted, t)],
    ]),
    section("parameters", "resources.detail.provider.parametersReference", [
      ["resources.detail.provider.parametersReference", namedReferenceLabel(detail.parametersRef)],
    ]),
  ];
  return [
    section("overview", "resources.detail.provider.overview", [
      ["resources.detail.provider.poolName", detail.poolName],
      ["resources.detail.provider.vmSize", detail.vmSize],
      ["resources.detail.provider.mode", detail.mode],
      ["resources.detail.provider.osType", detail.osType],
      ["resources.detail.provider.osDisk", disk(detail.osDiskType, detail.osDiskSizeGb)],
      ["resources.detail.provider.priority", detail.priority],
      ["resources.detail.provider.maxPods", number(detail.maxPods)],
    ]),
    scalingSection(detail.scaling),
    section("configuration", "resources.detail.provider.configuration", [
      ["resources.detail.provider.scaleDownMode", detail.scaleDownMode],
      ["resources.detail.provider.failureDomains", join(detail.availabilityZones)],
      ["resources.detail.provider.labels", join(detail.labels.map(({ key, value }) => `${key}=${value}`))],
      ["resources.detail.provider.taints", join(detail.taints.map((item) => join([item.key, item.value, item.effect])!).filter(Boolean))],
    ]),
  ];
}

function replicaSection(
  id: string,
  label: MessageKey,
  value: { desired: number | null; ready: number | null; available: number | null; upToDate: number | null },
): ProviderSection {
  return section(id, label, [
    ["resources.detail.provider.desired", number(value.desired)],
    ["resources.detail.provider.ready", number(value.ready)],
    ["resources.detail.provider.available", number(value.available)],
    ["resources.detail.provider.upToDate", number(value.upToDate)],
  ]);
}

function referencesSection(
  first: { apiVersion: string | null; kind: string; namespace: string | null; name: string } | null,
  second: { apiVersion: string | null; kind: string; namespace: string | null; name: string } | null,
): ProviderSection {
  return section("references", "resources.detail.provider.references", [
    ["resources.detail.provider.bootstrap", referenceLabel(first)],
    ["resources.detail.provider.infrastructure", referenceLabel(second)],
  ]);
}

function referenceLabel(
  value: { apiVersion: string | null; kind: string; namespace: string | null; name: string } | null,
): string | null {
  return value === null ? null : join([value.kind, value.namespace, value.name]);
}

function namedReferenceLabel(
  value: { apiVersion: string | null; kind: string | null; namespace: string | null; name: string } | null,
): string | null {
  return value === null ? null : join([value.kind, value.namespace, value.name]);
}

function scalingSection(
  value: { minimum: number | null; maximum: number | null; current: number | null },
  maxUnavailable: number | null = null,
): ProviderSection {
  return section("scaling", "resources.detail.provider.scaling", [
    ["resources.detail.provider.minimum", number(value.minimum)],
    ["resources.detail.provider.maximum", number(value.maximum)],
    ["resources.detail.provider.current", number(value.current)],
    ["resources.detail.provider.maxUnavailable", number(maxUnavailable)],
  ]);
}

function section(
  id: string,
  label: MessageKey,
  rows: Array<[MessageKey, string | null]>,
): ProviderSection {
  return { id, label, rows };
}

function formatAwsSubnet(value: {
  id: string | null;
  availabilityZone: string | null;
  public: boolean | null;
  cidrBlock: string | null;
}): string {
  return join([
    value.id,
    value.availabilityZone,
    value.public === null ? null : value.public ? "public" : "private",
    value.cidrBlock,
  ]) ?? "";
}

function yesNo(value: boolean | null, t: TranslationFunction): string | null {
  return value === null
    ? null
    : t(value ? "resources.detail.value.yes" : "resources.detail.value.no");
}

function disk(type: string | null, size: number | null): string | null {
  return join([type, numberWithUnit(size, "GB")]);
}

function numberWithUnit(value: number | null, unit: string): string | null {
  return value === null ? null : `${value} ${unit}`;
}

function number(value: number | null): string | null {
  return value === null ? null : String(value);
}

function seconds(value: number | null): string | null {
  return value === null ? null : `${value}s`;
}

function formatSecretMapping(value: {
  secretKey: string | null;
  remoteKey: string | null;
  remoteProperty: string | null;
  remoteVersion: string | null;
}): string {
  return join([
    value.secretKey,
    value.remoteKey,
    value.remoteProperty,
    value.remoteVersion,
  ]) ?? "";
}

function formatKeyValues(values: Array<{ key: string; value: string }>): string | null {
  return join(values.map(({ key, value }) => `${key}=${value}`));
}

function toggleSet(current: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function join(values: Array<string | null>): string | null {
  const present = values.filter((value): value is string => value !== null && value.length > 0);
  return present.length > 0 ? present.join(" · ") : null;
}
