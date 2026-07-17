import { apiRequest, type ApiPath } from "./client";
import {
  acceptedConfigMutationSchema,
  type AcceptedConfigMutationEndpoint,
} from "./accepted-event-schemas";
import {
  helmChartCatalogPageSchema,
  helmChartDetailSchema,
  helmChartSourcePageSchema,
  helmChartSourceSchema,
  helmRepositoryRefreshSchema,
  type HelmChartCatalogPageEndpoint,
  type HelmChartDetailEndpoint,
  type HelmChartSourceEndpoint,
  type HelmChartSourcePageEndpoint,
  type HelmRepositoryRefreshEndpoint,
} from "./helm-chart-sources-schemas";
import { encodePathSegment, withQuery } from "./url";

export const HELM_CHART_SOURCES_PATH = "/api/helm/chart-sources" as const;
export const HELM_CHARTS_PATH = "/api/helm/charts" as const;
export const HELM_REPOSITORY_UPDATE_PATH = "/api/helm/repositories/{name}/update" as const;

const SOURCE_PAGE_MAX = 100;
const CURSOR_MAX = 4096;
const NAME_MAX = 120;
const REFERENCE_MAX = 2048;
const USERNAME_MAX = 512;
const SECRET_MAX = 16_384;

export type HelmChartSourceProviderEndpoint = "repository" | "oci";

export type HelmChartSourceCredentialRequest =
  | { kind: "bearer"; token: string }
  | { kind: "basic"; username: string; password: string };

export interface HelmChartSourceRegisterRequest {
  provider: HelmChartSourceProviderEndpoint;
  name: string;
  reference: string;
  credential?: HelmChartSourceCredentialRequest;
}

export interface HelmChartSourceListQuery {
  limit?: number;
  cursor?: string;
}

export interface HelmChartSourceDeleteRequest {
  provider: HelmChartSourceProviderEndpoint;
  name: string;
  reference: string;
}

export interface HelmChartSearchQuery {
  query?: string;
  sourceId?: string;
  provider?: HelmChartSourceProviderEndpoint;
  allVersions?: boolean;
  limit?: number;
}

export interface HelmChartDetailRequest {
  sourceId: string;
  chart: string;
  version?: string;
}

export function listHelmChartSources(
  query: HelmChartSourceListQuery = {},
  signal?: AbortSignal,
): Promise<HelmChartSourcePageEndpoint> {
  const limit = optionalLimit(query.limit);
  const cursor = optionalCursor(query.cursor);
  return apiRequest(withQuery(HELM_CHART_SOURCES_PATH, [
    ["limit", limit],
    ["cursor", cursor],
  ]), helmChartSourcePageSchema, { signal });
}

export function registerHelmChartSource(
  input: HelmChartSourceRegisterRequest,
  signal?: AbortSignal,
): Promise<HelmChartSourceEndpoint> {
  const body = {
    provider: input.provider,
    name: requiredText(input.name, "name", NAME_MAX),
    reference: requiredText(input.reference, "reference", REFERENCE_MAX),
    ...(input.credential ? { credential: credentialBody(input.credential) } : {}),
  };
  return apiRequest(HELM_CHART_SOURCES_PATH as ApiPath, helmChartSourceSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

export function deleteHelmChartSource(
  sourceId: string,
  input: HelmChartSourceDeleteRequest,
  signal?: AbortSignal,
): Promise<AcceptedConfigMutationEndpoint> {
  const id = requiredSourceId(sourceId);
  const path = `${HELM_CHART_SOURCES_PATH}/${id}` as ApiPath;
  return apiRequest(path, acceptedConfigMutationSchema, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: input.provider,
      name: requiredText(input.name, "name", NAME_MAX),
      reference: requiredText(input.reference, "reference", REFERENCE_MAX),
    }),
    signal,
  });
}

export function refreshHelmRepository(
  name: string,
  signal?: AbortSignal,
): Promise<HelmRepositoryRefreshEndpoint> {
  const path = HELM_REPOSITORY_UPDATE_PATH.replace(
    "{name}",
    encodePathSegment(requiredText(name, "name", NAME_MAX)),
  ) as ApiPath;
  return apiRequest(path, helmRepositoryRefreshSchema, { method: "POST", signal });
}

export function searchHelmCharts(
  query: HelmChartSearchQuery = {},
  signal?: AbortSignal,
): Promise<HelmChartCatalogPageEndpoint> {
  const text = (query.query ?? "").trim();
  if (text.length > 200) throw new TypeError("query must not exceed 200 characters");
  const sourceId = query.sourceId === undefined ? undefined : requiredSourceId(query.sourceId);
  const limit = query.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("limit must be an integer between 1 and 100");
  }
  return apiRequest(withQuery(HELM_CHARTS_PATH, [
    ["query", text],
    ["source_id", sourceId],
    ["provider", query.provider],
    ["allVersions", String(query.allVersions ?? false)],
    ["limit", String(limit)],
  ]), helmChartCatalogPageSchema, { signal });
}

export function getHelmChartDetail(
  input: HelmChartDetailRequest,
  signal?: AbortSignal,
): Promise<HelmChartDetailEndpoint> {
  const sourceId = requiredSourceId(input.sourceId);
  const chart = requiredChartName(input.chart);
  const version = input.version === undefined
    ? ""
    : `/${encodePathSegment(requiredText(input.version, "version", 256))}`;
  const path = `${HELM_CHARTS_PATH}/${sourceId}/${encodePathSegment(chart)}${version}` as ApiPath;
  return apiRequest(path, helmChartDetailSchema, { signal });
}

function optionalLimit(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > SOURCE_PAGE_MAX) {
    throw new RangeError(`limit must be an integer between 1 and ${SOURCE_PAGE_MAX}`);
  }
  return value;
}

function optionalCursor(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.trim() === "" || value.length > CURSOR_MAX) {
    throw new TypeError("cursor must be a non-empty opaque value");
  }
  return value;
}

function requiredText(value: string, name: string, max: number): string {
  const normalized = value.trim();
  if (normalized === "" || normalized.length > max) {
    throw new TypeError(`${name} must contain between 1 and ${max} characters`);
  }
  return normalized;
}

function requiredSourceId(value: string): string {
  const normalized = value.trim();
  if (!/^[a-z0-9-]{1,80}$/.test(normalized)) {
    throw new TypeError("sourceId must be a canonical Helm chart source ID");
  }
  return normalized;
}

function requiredChartName(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length > 512
    || !/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(normalized)
  ) {
    throw new TypeError("chart must be a canonical Helm chart name");
  }
  return normalized;
}

function credentialBody(credential: HelmChartSourceCredentialRequest) {
  if (credential.kind === "bearer") {
    return {
      kind: credential.kind,
      token: requiredSecret(credential.token, "token"),
    } as const;
  }
  return {
    kind: credential.kind,
    username: requiredText(credential.username, "username", USERNAME_MAX),
    password: requiredSecret(credential.password, "password"),
  } as const;
}

function requiredSecret(value: string, name: string): string {
  if (value.length < 1 || value.length > SECRET_MAX) {
    throw new TypeError(`${name} must contain between 1 and ${SECRET_MAX} characters`);
  }
  return value;
}
