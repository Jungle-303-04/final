const KUBERNETES_NAMESPACE = /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/u;

export function canonicalKubernetesNamespaces(
  values: readonly string[],
  maxValues: number,
): readonly string[] {
  if (!Number.isInteger(maxValues) || maxValues < 1 || values.length > maxValues) {
    throw new RangeError("Kubernetes namespace scope is too large");
  }
  const normalized = values.map((value) => value.trim());
  if (normalized.some((value, index) =>
    value !== values[index]
    || value.length === 0
    || value.length > 63
    || !KUBERNETES_NAMESPACE.test(value))) {
    throw new TypeError("Kubernetes namespace is invalid");
  }
  return [...new Set(normalized)].sort();
}
