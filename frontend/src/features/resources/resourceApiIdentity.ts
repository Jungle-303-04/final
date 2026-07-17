import type { ResourceRef } from "../../shared/parity/referenceParity";
import type { ResourceDetail } from "./resourcesContract";

export function splitResourceApiVersion(
  value: string,
): { apiGroup: string; version: string } | null {
  const normalized = value.trim().replace(/^\/+|\/+$/gu, "");
  if (!normalized) return null;
  const segments = normalized.split("/");
  if (segments.length === 1 && segments[0]) {
    return { apiGroup: "", version: segments[0] };
  }
  if (segments.length === 2 && segments[0] && segments[1]) {
    return { apiGroup: segments[0], version: segments[1] };
  }
  return null;
}

export function exactResourceRef(detail: ResourceDetail): ResourceRef | null {
  const uid = detail.resource.uid;
  const api = splitResourceApiVersion(detail.resource.apiVersion);
  if (!uid || api === null) return null;
  return {
    apiGroup: api.apiGroup,
    version: api.version,
    kind: detail.identity.kind,
    namespace: detail.identity.namespace,
    name: detail.identity.name,
    uid,
  };
}

export function sameResourceRef(left: ResourceRef, right: ResourceRef): boolean {
  return (left.apiGroup ?? "") === (right.apiGroup ?? "")
    && (left.version ?? "") === (right.version ?? "")
    && left.kind === right.kind
    && left.namespace === right.namespace
    && left.name === right.name
    && left.uid === right.uid;
}
