import type { MessageKey, TranslationFunction } from "../../shared/i18n";
import { useI18n } from "../../shared/i18n";
import { StatusMark } from "../../shared/ui/StatusMark";
import type {
  ProviderCondition,
  ProviderResourceDetail,
} from "../../features/resources/providerResourceContract";
import { DefinitionGrid } from "./ResourceFactsPanel";

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
      {detail.conditions.length > 0 ? <ProviderConditions conditions={detail.conditions} /> : null}
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

function join(values: Array<string | null>): string | null {
  const present = values.filter((value): value is string => value !== null && value.length > 0);
  return present.length > 0 ? present.join(" · ") : null;
}
