import type { TopologyHierarchySnapshot } from "../contracts";

/**
 * Backend contract for the current hierarchy-bootstrap projection.
 *
 * The endpoint returns one atomic, provider-neutral Cluster -> Node -> Pod cut.
 * The frontend never joins provider responses, derives ownership from names, or
 * fabricates metrics. A backend implementation can use any internal storage or
 * collector as long as the response satisfies this semantic contract.
 *
 * This is not a second Full Topology protocol. It only feeds
 * `TopologyHierarchyGateway` while the product's canonical ResourceGraph
 * snapshot + stream gateway is not connected. At cutover, composition must
 * replace this gateway; it must never open both transports for one runtime or
 * merge hierarchy-bootstrap data into a ResourceGraph stream.
 *
 * Request (proposed default route; deployments may configure another path)
 * - method: `GET`
 * - path: `/api/v1/workspaces/{workspaceId}/topology/hierarchy-snapshots/current`
 * - request body: none
 * - `workspaceId`: opaque authenticated workspace ID, URL encoded by the client
 * - headers: `Accept: application/json`, `X-Request-ID: <opaque request id>`
 * - authentication: session cookie or an injected Authorization header provider
 * - cancellation: the browser aborts the request through `AbortSignal`
 *
 * Successful response
 * - status: `200`
 * - content type: `application/json` or an `application/*+json` media type
 * - body: `{ data: TopologyHierarchySnapshot }`
 * - the body is one atomic observation cut; clusters, descendants, metrics,
 *   `snapshotRevision`, `observedAt`, `completeness`, and the independent
 *   `freshness` axis must describe that cut
 * - `dataOrigin.kind` must be `live`; live responses must never identify as demo
 *
 * Error response
 * - use the HTTP status semantically (401, 403, 404, 409, 412, 422, 429,
 *   502/503, or 5xx)
 * - preferred body: `{ error: { code, message, correlationId?, details? } }`
 * - `Retry-After` is required for 429 and recommended for temporary 503s
 * - internal/provider payloads and secrets must not appear in `message/details`
 *
 * Identity and value rules
 * - every ID is opaque; display names are never IDs
 * - `entityKey` is globally unique inside the snapshot and stable for the same
 *   live object; an object recreated with a new resource UID gets a new key
 * - `snapshotRevision` is opaque, non-empty, and changes whenever the semantic
 *   snapshot changes; clients do not parse it
 * - timestamps are RFC 3339 with `Z` or an explicit offset
 * - metric numbers are non-negative canonical decimal strings, never JSON
 *   numbers; zero is the explicit `{ state: "zero", valueDecimal: "0" }`
 * - unavailable values use missing/forbidden/unsupported with a reason; fields
 *   must not be omitted and the frontend must not convert them to zero
 * - every entity contains an explicit value state for every `areaMetrics` entry
 * - `defaultAreaMetricId` references one entry in `areaMetrics`
 * - `complete` means the entire authorized Cluster -> Node -> Pod bootstrap
 *   universe is present. Source failure, permission redaction, or a payload
 *   budget truncation must use `partial` with at least one reason
 * - an authorized Cluster with zero Nodes and a Node with zero Pods are valid
 *   empty collections; missing arrays are never used to mean unavailable
 * - this bootstrap endpoint has no pagination. If the hierarchy cannot fit the
 *   agreed payload budget, do not emit `complete`; cut over to the canonical
 *   ResourceGraph expansion/stream contract instead of inventing local pages
 * - parent metrics are backend-authoritative. The frontend does not sum child
 *   values. If authorized descendants are incomplete, report partial
 *   completeness rather than silently pretending the aggregate is exhaustive
 * - partial completeness has at least one safe, user-actionable reason
 * - `freshness` is independent from health and completeness: `complete + stale`
 *   and `partial + fresh` are both valid
 * - `receivedAt` is canonical UTC; for fresh/stale, `ageMs` exactly equals
 *   `receivedAt - freshness.observedAt`; fresh uses `<= staleAfterMs`, stale
 *   uses `> staleAfterMs`; unknown has null observation fields and a safe reason
 */
export const TOPOLOGY_HIERARCHY_API = Object.freeze({
  method: "GET",
  proposedPathTemplate:
    "/api/v1/workspaces/{workspaceId}/topology/hierarchy-snapshots/current",
  requestMediaType: null,
  responseMediaType: "application/json",
  responseSchemaVersion: "topology-hierarchy/v1",
} as const);

export type TopologyHierarchySnapshotResponse = {
  readonly data: TopologyHierarchySnapshot;
};

/** Browser/runtime authentication headers, resolved immediately before fetch. */
export type TopologyAuthHeadersProvider = (
  signal: AbortSignal,
) => HeadersInit | Promise<HeadersInit>;

export type TopologyFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type TopologyHierarchyHttpConfig = {
  /** API origin or root-relative prefix. Examples: `https://api.example.test`, `/`. */
  readonly baseUrl: string;
  /** Opaque authorized workspace ID. It is encoded as one URL path segment. */
  readonly workspaceId: string;
  /** Must equal the live `dataOrigin.adapterId` returned by the endpoint. */
  readonly adapterId: string;
  /**
   * Root-relative route with exactly one `{workspaceId}` placeholder.
   * Defaults to `TOPOLOGY_HIERARCHY_API.proposedPathTemplate`; this proposal is
   * not an authority over an accepted OpenAPI route.
   */
  readonly pathTemplate?: string;
  /** Defaults to `same-origin`; choose `include` only for an intentional CORS setup. */
  readonly credentials?: RequestCredentials;
};

function normalizedBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (trimmed === "/") return "";
  return trimmed.replace(/\/+$/u, "");
}

export function isValidTopologyApiBaseUrl(value: string): boolean {
  const candidate = value.trim();
  if (candidate === "/") return true;
  if (candidate.startsWith("/")) {
    return (
      !candidate.startsWith("//") &&
      !candidate.includes("?") &&
      !candidate.includes("#")
    );
  }
  try {
    const url = new URL(candidate);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.search.length === 0 &&
      url.hash.length === 0
    );
  } catch {
    return false;
  }
}

export function isValidTopologyHierarchyPathTemplate(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("?") &&
    !value.includes("#") &&
    value.split("{workspaceId}").length === 2
  );
}

/**
 * Constructs the canonical endpoint without interpreting either opaque ID.
 * A slash inside a workspace ID is encoded and cannot alter the API path.
 */
export function buildTopologyHierarchySnapshotUrl(
  baseUrl: string,
  workspaceId: string,
  pathTemplate: string = TOPOLOGY_HIERARCHY_API.proposedPathTemplate,
): string {
  const path = pathTemplate.replace(
    "{workspaceId}",
    encodeURIComponent(workspaceId),
  );
  return `${normalizedBaseUrl(baseUrl)}${path}`;
}
