import type {
  HelmChartSummary,
  HelmChartSource,
  HelmPort,
  HelmUpgradeTarget,
} from "./helmContract";
import { withHelmPortFailure } from "./helmAdapterRuntime";
import type { HelmEndpointDependencies } from "./helmEndpointContract";

type HelmChartSourcesPort = Pick<
  HelmPort,
  | "deleteChartSource"
  | "getChartDetail"
  | "listChartSources"
  | "refreshChartSource"
  | "registerChartSource"
  | "searchCharts"
>;

export function createHelmChartSourcesPort(
  endpoints: HelmEndpointDependencies,
): HelmChartSourcesPort {
  return {
    async searchCharts(request = {}, signal) {
      return withHelmPortFailure(async () => {
        const response = await endpoints.searchHelmCharts(request, signal);
        return {
          availability: response.availability,
          items: response.items.map(toChartSummary),
          total: response.total,
          limit: response.limit,
          query: response.query,
          sourceId: response.source_id,
          provider: response.provider,
          allVersions: response.all_versions,
          observedAt: response.observed_at,
          truncated: response.truncated,
          reasonCodes: response.reason_codes,
        };
      });
    },
    async getChartDetail(request, signal) {
      return withHelmPortFailure(async () => {
        const response = await endpoints.getHelmChartDetail(request, signal);
        return {
          availability: response.availability,
          chart: response.chart ? toChartSummary(response.chart) : null,
          versions: response.versions.map((item) => ({
            version: item.version,
            appVersion: item.app_version,
            deprecated: item.deprecated,
          })),
          valuesSchema: response.values_schema.availability === "available"
            ? { availability: "available" as const, schema: response.values_schema.schema }
            : {
              availability: "unavailable" as const,
              schema: null,
              reasonCode: response.values_schema.reason_code,
            },
          install: response.install.availability === "available"
            ? { availability: "available" as const, target: toUpgradeTarget(response.install.target) }
            : {
              availability: "unavailable" as const,
              target: null,
              reasonCode: response.install.reason_code,
            },
          observedAt: response.observed_at,
          truncated: response.truncated,
          reasonCodes: response.reason_codes,
        };
      });
    },
    async listChartSources(request = {}, signal) {
      return withHelmPortFailure(async () => {
        const response = await endpoints.listHelmChartSources(request, signal);
        return {
          items: response.items.map(toChartSource),
          limit: response.limit,
          hasMore: response.has_more,
          nextCursor: response.next_cursor,
        };
      });
    },
    async registerChartSource(request, signal) {
      return withHelmPortFailure(async () => toChartSource(
        await endpoints.registerHelmChartSource(request, signal),
      ));
    },
    async deleteChartSource(request, signal) {
      return withHelmPortFailure(async () => {
        const receipt = await endpoints.deleteHelmChartSource(request.id, {
          provider: request.provider,
          name: request.name,
          reference: request.reference,
        }, signal);
        return {
          accepted: receipt.accepted,
          eventId: receipt.event_id,
          correlationId: receipt.correlation_id,
        };
      });
    },
    async refreshChartSource(name, signal) {
      return withHelmPortFailure(async () => {
        const result = await endpoints.refreshHelmRepository(name, signal);
        return {
          sourceId: result.source_id,
          chartCount: result.chart_count,
          observedAt: result.observed_at,
          eventId: result.event_id,
          correlationId: result.correlation_id,
        };
      });
    },
  };
}

export function toChartSource(
  value: Awaited<ReturnType<HelmEndpointDependencies["listHelmChartSources"]>>["items"][number],
): HelmChartSource {
  return {
    id: value.source_id,
    provider: value.provider,
    name: value.name,
    reference: value.reference,
    status: value.status,
    actions: value.actions,
    credentialsConfigured: value.credentials_configured,
    observedAt: value.observed_at,
  };
}

function toChartSummary(value: {
  source: Parameters<typeof toChartSource>[0];
  name: string;
  version: string;
  app_version: string | null;
  description: string | null;
  deprecated: boolean;
}): HelmChartSummary {
  return {
    source: toChartSource(value.source),
    name: value.name,
    version: value.version,
    appVersion: value.app_version,
    description: value.description,
    deprecated: value.deprecated,
  };
}

export function toUpgradeTarget(value: {
  item_id: string;
  name: string;
  version: string;
  chart_version: string;
  inputs: Array<{
    name: string;
    value_type: "string" | "integer" | "number" | "boolean";
    required: boolean;
    default: string | number | boolean | null;
    allowed_values: Array<string | number | boolean | null>;
  }>;
}): HelmUpgradeTarget {
  return {
    itemId: value.item_id,
    name: value.name,
    version: value.version,
    chartVersion: value.chart_version,
    inputs: value.inputs.map((input) => ({
      name: input.name,
      valueType: input.value_type,
      required: input.required,
      defaultValue: input.default,
      allowedValues: input.allowed_values,
    })),
  };
}
