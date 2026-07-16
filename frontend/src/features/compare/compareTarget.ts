import type { CompareTarget } from "./compareContract";

const MAX_NAME_LENGTH = 253;
const MAX_NAMESPACE_LENGTH = 63;

export function parseCompareTarget(value: string | null): CompareTarget | null {
  if (value === null || value !== value.trim() || !value || value.length > MAX_NAME_LENGTH + MAX_NAMESPACE_LENGTH + 1) return null;
  const slash = value.indexOf("/");
  if (slash < 0) return validName(value) ? { namespace: null, name: value } : null;
  if (slash !== value.lastIndexOf("/")) return null;
  const namespace = value.slice(0, slash);
  const name = value.slice(slash + 1);
  return validNamespace(namespace) && validName(name) ? { namespace, name } : null;
}

export function compareTargetParam(target: CompareTarget): string {
  if (!validName(target.name) || (target.namespace !== null && !validNamespace(target.namespace))) {
    throw new TypeError("comparison target is invalid");
  }
  return target.namespace === null ? target.name : `${target.namespace}/${target.name}`;
}

function validName(value: string): boolean {
  return value.length > 0 && value.length <= MAX_NAME_LENGTH && value === value.trim() && !value.includes("/") && !/\s/.test(value);
}

function validNamespace(value: string): boolean {
  return value.length > 0 && value.length <= MAX_NAMESPACE_LENGTH && value === value.trim() && /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/u.test(value);
}
