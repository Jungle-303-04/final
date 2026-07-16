import type {
  HelmChartSource,
  HelmPort,
} from "./helmContract";
import { withHelmPortFailure } from "./helmAdapterRuntime";
import type { HelmEndpointDependencies } from "./helmEndpointContract";

type HelmChartSourcesPort = Pick<HelmPort, "listChartSources" | "registerChartSource">;

export function createHelmChartSourcesPort(
  endpoints: HelmEndpointDependencies,
): HelmChartSourcesPort {
  return {
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
  };
}

function toChartSource(
  value: Awaited<ReturnType<HelmEndpointDependencies["listHelmChartSources"]>>["items"][number],
): HelmChartSource {
  return {
    id: value.source_id,
    provider: value.provider,
    name: value.name,
    reference: value.reference,
    status: value.status,
    credentialsConfigured: value.credentials_configured,
    observedAt: value.observed_at,
  };
}
