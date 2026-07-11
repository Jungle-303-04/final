import type {
  DataOrigin,
  TopologyHierarchyGateway,
  TopologyHierarchySnapshot,
} from "../contracts";
import {
  buildTopologyHierarchySnapshotUrl,
  categoryForHttpStatus,
  isValidTopologyApiBaseUrl,
  isValidTopologyHierarchyPathTemplate,
  parseCanonicalApiProblem,
  parseLiveTopologyHierarchyResponse,
  retryAfterMilliseconds,
  TOPOLOGY_HIERARCHY_API,
  TopologyHttpError,
  TopologyResponseValidationError,
  type TopologyAuthHeadersProvider,
  type TopologyFetch,
  type TopologyHierarchyHttpConfig,
} from "../api";

export type HttpTopologyHierarchyGatewayDependencies = {
  readonly fetchImpl?: TopologyFetch;
  readonly authHeaders?: TopologyAuthHeadersProvider;
  readonly createRequestId?: () => string;
};

function defaultRequestId(): string {
  return globalThis.crypto.randomUUID();
}

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
  return (
    contentType.includes("application/json") ||
    /^application\/[a-z0-9!#$&^_.+-]+\+json(?:;|$)/u.test(contentType)
  );
}

async function responseJsonOrNull(response: Response): Promise<unknown | null> {
  if (!isJsonResponse(response)) return null;
  try {
    return await response.json();
  } catch (reason: unknown) {
    if (isAbortError(reason)) throw reason;
    return null;
  }
}

/**
 * Production HTTP adapter for the initial hierarchy topology experience.
 *
 * This is the only layer that knows URL, headers, credentials, `fetch`, or the
 * wire envelope. Components depend solely on `TopologyHierarchyGateway`.
 * Dependencies are injected so the same contract suite can run against mocked
 * HTTP and an authenticated product composition root.
 *
 * There is intentionally no synthetic fallback. A live transport/schema failure
 * stays a typed live error and cannot be mistaken for real cluster data.
 */
export class HttpTopologyHierarchyGateway
  implements TopologyHierarchyGateway
{
  readonly dataOrigin: DataOrigin;
  readonly #config: Required<
    Pick<
      TopologyHierarchyHttpConfig,
      "baseUrl" | "workspaceId" | "adapterId" | "pathTemplate"
    >
  > & { readonly credentials: RequestCredentials };
  readonly #fetch: TopologyFetch;
  readonly #authHeaders: TopologyAuthHeadersProvider | undefined;
  readonly #createRequestId: () => string;

  constructor(
    config: TopologyHierarchyHttpConfig,
    dependencies: HttpTopologyHierarchyGatewayDependencies = {},
  ) {
    if (!isValidTopologyApiBaseUrl(config.baseUrl)) {
      throw new TypeError(
        "Topology API baseUrl must be an HTTP(S) URL or root-relative prefix without query/hash/credentials",
      );
    }
    if (config.workspaceId.trim().length === 0) {
      throw new TypeError("Topology workspaceId must not be blank");
    }
    if (config.adapterId.trim().length === 0) {
      throw new TypeError("Topology adapterId must not be blank");
    }
    const pathTemplate =
      config.pathTemplate ??
      TOPOLOGY_HIERARCHY_API.proposedPathTemplate;
    if (!isValidTopologyHierarchyPathTemplate(pathTemplate)) {
      throw new TypeError(
        "Topology pathTemplate must be root-relative and contain exactly one {workspaceId}",
      );
    }

    this.#config = {
      baseUrl: config.baseUrl,
      workspaceId: config.workspaceId,
      adapterId: config.adapterId,
      pathTemplate,
      credentials: config.credentials ?? "same-origin",
    };
    this.dataOrigin = { kind: "live", adapterId: config.adapterId };
    this.#fetch = dependencies.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#authHeaders = dependencies.authHeaders;
    this.#createRequestId = dependencies.createRequestId ?? defaultRequestId;
  }

  async getSnapshot(signal: AbortSignal): Promise<TopologyHierarchySnapshot> {
    signal.throwIfAborted();
    const requestId = this.#createRequestId();
    let response: Response;

    try {
      const authHeaders = await this.#authHeaders?.(signal);
      signal.throwIfAborted();
      const headers = new Headers(authHeaders);
      headers.set("Accept", "application/json");
      headers.set("X-Request-ID", requestId);

      response = await this.#fetch(
        buildTopologyHierarchySnapshotUrl(
          this.#config.baseUrl,
          this.#config.workspaceId,
          this.#config.pathTemplate,
        ),
        {
          method: "GET",
          headers,
          credentials: this.#config.credentials,
          cache: "no-store",
          signal,
        },
      );
    } catch (reason: unknown) {
      if (signal.aborted) signal.throwIfAborted();
      if (isAbortError(reason)) throw reason;
      if (reason instanceof TopologyHttpError) throw reason;
      throw new TopologyHttpError({
        category: "network",
        requestId,
        httpStatus: null,
        backendCode: null,
        correlationId: null,
        retryAfterMs: null,
        cause: reason,
      });
    }

    if (!response.ok) {
      const problem = parseCanonicalApiProblem(await responseJsonOrNull(response));
      throw new TopologyHttpError({
        category: categoryForHttpStatus(response.status),
        requestId,
        httpStatus: response.status,
        backendCode: problem?.code ?? null,
        correlationId:
          problem?.correlationId ??
          response.headers.get("X-Correlation-ID") ??
          null,
        retryAfterMs: retryAfterMilliseconds(response.headers.get("Retry-After")),
      });
    }

    if (!isJsonResponse(response)) {
      throw new TopologyHttpError({
        category: "invalid_response",
        requestId,
        httpStatus: response.status,
        backendCode: "unexpected_content_type",
        correlationId: response.headers.get("X-Correlation-ID"),
        retryAfterMs: null,
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (reason: unknown) {
      if (signal.aborted) signal.throwIfAborted();
      if (isAbortError(reason)) throw reason;
      throw new TopologyHttpError({
        category: "invalid_response",
        requestId,
        httpStatus: response.status,
        backendCode: "invalid_json",
        correlationId: response.headers.get("X-Correlation-ID"),
        retryAfterMs: null,
        cause: reason,
      });
    }

    try {
      return parseLiveTopologyHierarchyResponse(body, {
        workspaceId: this.#config.workspaceId,
        adapterId: this.#config.adapterId,
      });
    } catch (reason: unknown) {
      if (!(reason instanceof TopologyResponseValidationError)) throw reason;
      throw new TopologyHttpError({
        category: "invalid_response",
        requestId,
        httpStatus: response.status,
        backendCode: "schema_incompatible",
        correlationId: response.headers.get("X-Correlation-ID"),
        retryAfterMs: null,
        validationIssues: reason.issues,
        cause: reason,
      });
    }
  }
}
