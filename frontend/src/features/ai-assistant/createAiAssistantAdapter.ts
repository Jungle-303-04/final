import type {
  AiAssistantContext,
  AiAssistantPort,
  AiAssistantFailureCode,
} from "./aiAssistantContract";
import { AiAssistantPortFailure } from "./aiAssistantContract";
import type {
  AiAssistantContextEndpoint,
  AiAssistantEndpointDependencies,
} from "./aiAssistantEndpointContract";

export function createAiAssistantAdapter(
  endpoints: AiAssistantEndpointDependencies,
): AiAssistantPort {
  return {
    async ask(context, message, signal) {
      return withFailure(async () => {
        const response = await endpoints.postAiChat(toEndpointContext(context), message, signal);
        return {
          answer: response.answer,
          evidence: response.evidence.map((item) => ({
            ...item,
            link: item.link as `/${string}`,
          })),
        };
      });
    },
    async loadSuggestions(context, signal) {
      return withFailure(async () => (
        await endpoints.getAiSuggestions(toEndpointContext(context), signal)
      ).suggestions);
    },
  };
}

function toEndpointContext(context: AiAssistantContext): AiAssistantContextEndpoint {
  return {
    screen: context.screen,
    filters: {
      clusters: context.filters.clusters,
      namespaces: context.filters.namespaces,
      applications: context.filters.applications,
      labels: context.filters.labels,
      resource_types: context.filters.resourceTypes,
      health: context.filters.health,
      query: context.filters.query,
    },
    selection: context.selection,
    time: context.time,
    log_stream_id: context.logStreamId,
  };
}

async function withFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof AiAssistantPortFailure) throw error;
    const kind = transportString(error, "kind");
    const status = transportNumber(error, "status");
    const byKind: Record<string, AiAssistantFailureCode> = {
      unauthorized: "unauthorized",
      forbidden: "forbidden",
      network: "offline",
      "rate-limited": "rate-limited",
      "invalid-request": "invalid-request",
      "invalid-payload": "invalid-response",
    };
    const byStatus: Record<number, AiAssistantFailureCode> = {
      401: "unauthorized",
      403: "forbidden",
      422: "invalid-request",
      429: "rate-limited",
      503: "unavailable",
    };
    throw new AiAssistantPortFailure(byKind[kind ?? ""] ?? byStatus[status ?? -1] ?? "error");
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function transportString(error: unknown, key: string): string | null {
  if (typeof error !== "object" || error === null || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function transportNumber(error: unknown, key: string): number | null {
  if (typeof error !== "object" || error === null || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
