import {
  TopologyGatewayError,
  type TopologyHierarchyGateway,
} from "../features/topology/contracts";
import {
  HttpTopologyHierarchyGateway,
  type HttpTopologyHierarchyGatewayDependencies,
} from "../features/topology/adapters/HttpTopologyHierarchyGateway";
import {
  isValidTopologyApiBaseUrl,
  isValidTopologyHierarchyPathTemplate,
} from "../features/topology/api";

export const LIVE_TOPOLOGY_ADAPTER_ID = "http-topology-hierarchy/v1";

type LiveTopologyEnvironment = Readonly<
  Record<string, string | boolean | undefined>
>;

export type LiveTopologyRuntimeConfig = {
  readonly baseUrl: string;
  readonly workspaceId: string;
  readonly credentials: RequestCredentials;
  readonly pathTemplate?: string;
};

export type LiveTopologyConfigResolution =
  | { readonly state: "configured"; readonly config: LiveTopologyRuntimeConfig }
  | { readonly state: "unconfigured"; readonly missing: readonly string[] }
  | { readonly state: "invalid"; readonly reason: string };

const CREDENTIALS = new Set<RequestCredentials>([
  "omit",
  "same-origin",
  "include",
]);

/**
 * Live topology runtime variables read by the browser composition root.
 *
 * Required:
 * - `VITE_TOPOLOGY_API_BASE_URL`: API origin or `/` for the current origin
 * - `VITE_TOPOLOGY_WORKSPACE_ID`: opaque authorized workspace ID
 *
 * Optional:
 * - `VITE_TOPOLOGY_API_CREDENTIALS`: omit | same-origin | include
 * - `VITE_TOPOLOGY_HIERARCHY_PATH_TEMPLATE`: accepted OpenAPI route with one
 *   `{workspaceId}` placeholder; otherwise the documented proposed route is used
 *
 * Do not put bearer tokens in `VITE_*`; Vite values are public build output.
 * Token authentication must be supplied through the injected `authHeaders`
 * dependency from a validated session/auth composition when it is introduced.
 */
export function resolveLiveTopologyConfig(
  environment: LiveTopologyEnvironment,
): LiveTopologyConfigResolution {
  const baseUrl = environment.VITE_TOPOLOGY_API_BASE_URL;
  const workspaceId = environment.VITE_TOPOLOGY_WORKSPACE_ID;
  const missing: string[] = [];

  if (typeof baseUrl !== "string" || baseUrl.trim().length === 0) {
    missing.push("VITE_TOPOLOGY_API_BASE_URL");
  }
  if (typeof workspaceId !== "string" || workspaceId.trim().length === 0) {
    missing.push("VITE_TOPOLOGY_WORKSPACE_ID");
  }
  if (missing.length > 0) return { state: "unconfigured", missing };
  if (!isValidTopologyApiBaseUrl(baseUrl as string)) {
    return {
      state: "invalid",
      reason:
        "VITE_TOPOLOGY_API_BASE_URL must be an HTTP(S) URL or root-relative prefix without query/hash/credentials",
    };
  }

  const credentialsValue = environment.VITE_TOPOLOGY_API_CREDENTIALS;
  const credentials =
    typeof credentialsValue === "string" && credentialsValue.length > 0
      ? credentialsValue
      : "same-origin";
  if (!CREDENTIALS.has(credentials as RequestCredentials)) {
    return {
      state: "invalid",
      reason:
        "VITE_TOPOLOGY_API_CREDENTIALS must be omit, same-origin, or include",
    };
  }
  const pathTemplateValue = environment.VITE_TOPOLOGY_HIERARCHY_PATH_TEMPLATE;
  const pathTemplate =
    typeof pathTemplateValue === "string" && pathTemplateValue.length > 0
      ? pathTemplateValue
      : undefined;
  if (
    pathTemplate !== undefined &&
    !isValidTopologyHierarchyPathTemplate(pathTemplate)
  ) {
    return {
      state: "invalid",
      reason:
        "VITE_TOPOLOGY_HIERARCHY_PATH_TEMPLATE must be root-relative and contain exactly one {workspaceId}",
    };
  }

  return {
    state: "configured",
    config: {
      baseUrl: baseUrl as string,
      workspaceId: workspaceId as string,
      credentials: credentials as RequestCredentials,
      ...(pathTemplate === undefined ? {} : { pathTemplate }),
    },
  };
}

function unconfiguredGateway(reason: string): TopologyHierarchyGateway {
  const dataOrigin = {
    kind: "live",
    adapterId: LIVE_TOPOLOGY_ADAPTER_ID,
  } as const;

  return {
    dataOrigin,
    async getSnapshot(signal) {
      signal.throwIfAborted();
      throw new TopologyGatewayError("unconfigured", reason);
    },
  };
}

/**
 * Selects only the live HTTP adapter for the production entry.
 * Missing/invalid configuration becomes an explicit live error gateway; it
 * never imports or falls back to SyntheticTopologyHierarchyGateway.
 * This composition owns the hierarchy-bootstrap transport only. When the
 * canonical Full Topology snapshot+stream gateway is enabled, replace this
 * composition rather than instantiating both and merging their revisions.
 */
export function createLiveTopologyGateway(
  dependencies: HttpTopologyHierarchyGatewayDependencies = {},
  environment: LiveTopologyEnvironment = import.meta.env,
): TopologyHierarchyGateway {
  const resolved = resolveLiveTopologyConfig(environment);
  if (resolved.state === "unconfigured") {
    return unconfiguredGateway(
      `Live topology API is not configured. Missing: ${resolved.missing.join(", ")}`,
    );
  }
  if (resolved.state === "invalid") {
    return unconfiguredGateway(`Live topology API configuration is invalid: ${resolved.reason}`);
  }

  return new HttpTopologyHierarchyGateway(
    {
      ...resolved.config,
      adapterId: LIVE_TOPOLOGY_ADAPTER_ID,
    },
    dependencies,
  );
}
