import type { ResourceFacts } from "../../features/resources/resourcesContract";
import {
  useI18n,
  type I18nController,
  type TranslationFunction,
} from "../../shared/i18n";

export function ResourceFactsPanel({ facts }: { facts: ResourceFacts }) {
  const { formatNumber, t } = useI18n();
  const entries = factsEntries(facts, t, formatNumber);
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby="resource-facts-title" className="grid gap-3 rounded-lg border p-4">
      <h3 className="font-medium" id="resource-facts-title">
        {t("resources.detail.facts")}
      </h3>
      <DefinitionGrid entries={entries} />
    </section>
  );
}

export function DefinitionGrid({ entries }: { entries: Array<[string, string]> }) {
  return (
    <dl className="grid min-w-0 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
      {entries.map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd
            className="min-w-0 font-medium [overflow-wrap:anywhere]"
            data-slot="resource-definition-value"
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function factsEntries(
  facts: ResourceFacts,
  t: TranslationFunction,
  formatNumber: I18nController["formatNumber"],
): Array<[string, string]> {
  if (facts.type === "pod") return compact([
    [t("resources.detail.fact.phase"), facts.phase],
    [t("resources.detail.fact.node"), facts.nodeName],
    [t("resources.detail.fact.owner"), facts.owner ? `${facts.owner.kind}/${facts.owner.name}` : null],
    [t("resources.detail.fact.restarts"), numberText(facts.restartCount, formatNumber)],
    [t("resources.detail.fact.cpu"), unitText(facts.cpuMillicores, "m", formatNumber)],
    [t("resources.detail.fact.memory"), unitText(facts.memoryMebibytes, "MiB", formatNumber)],
  ]);
  if (facts.type === "node") return compact([
    [t("resources.detail.fact.ready"), facts.ready === null
      ? null
      : facts.ready
        ? t("resources.detail.value.yes")
        : t("resources.detail.value.no")],
    [t("resources.detail.fact.podCapacity"), numberText(facts.podCapacity, formatNumber)],
    [t("resources.detail.fact.cpu"), unitText(facts.cpuMillicores, "m", formatNumber)],
    [t("resources.detail.fact.memory"), unitText(facts.memoryMebibytes, "MiB", formatNumber)],
  ]);
  if (facts.type === "workload") return compact([
    [t("resources.detail.fact.desired"), numberText(facts.desiredReplicas, formatNumber)],
    [t("resources.detail.fact.ready"), numberText(facts.readyReplicas, formatNumber)],
    [t("resources.detail.fact.available"), numberText(facts.availableReplicas, formatNumber)],
    [t("resources.detail.fact.updated"), numberText(facts.updatedReplicas, formatNumber)],
  ]);
  if (facts.type === "service") return compact([
    [t("resources.detail.fact.type"), facts.serviceType],
    [t("resources.detail.fact.clusterIp"), facts.clusterIp],
    [t("resources.detail.fact.externalUrl"), facts.externalUrl],
  ]);
  if (facts.type === "event") return compact([
    [t("resources.detail.fact.type"), facts.eventType],
    [t("resources.detail.fact.reason"), facts.reason],
    [t("resources.detail.fact.count"), numberText(facts.occurrenceCount, formatNumber)],
    [t("resources.detail.fact.reporter"), facts.reportingComponent],
  ]);
  return [];
}

function compact(entries: Array<[string, string | null]>): Array<[string, string]> {
  return entries.filter((entry): entry is [string, string] => entry[1] !== null);
}

function numberText(
  value: number | null,
  formatNumber: I18nController["formatNumber"],
): string | null {
  return value === null ? null : formatNumber(value);
}

function unitText(
  value: number | null,
  unit: string,
  formatNumber: I18nController["formatNumber"],
): string | null {
  return value === null ? null : `${formatNumber(value)} ${unit}`;
}
