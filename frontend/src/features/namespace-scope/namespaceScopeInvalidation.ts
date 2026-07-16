export interface NamespaceScopeInvalidation {
  clusterId: string;
  allowedNamespaces: readonly string[];
}

const NAMESPACE_SCOPE_INVALIDATED_EVENT = "opsia:namespace-scope-invalidated";

export function publishNamespaceScopeInvalidation(
  invalidation: NamespaceScopeInvalidation,
): void {
  window.dispatchEvent(new CustomEvent<NamespaceScopeInvalidation>(
    NAMESPACE_SCOPE_INVALIDATED_EVENT,
    { detail: invalidation },
  ));
}

export function subscribeNamespaceScopeInvalidation(
  listener: (invalidation: NamespaceScopeInvalidation) => void,
): () => void {
  const handler = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    listener(event.detail as NamespaceScopeInvalidation);
  };
  window.addEventListener(NAMESPACE_SCOPE_INVALIDATED_EVENT, handler);
  return () => window.removeEventListener(NAMESPACE_SCOPE_INVALIDATED_EVENT, handler);
}
