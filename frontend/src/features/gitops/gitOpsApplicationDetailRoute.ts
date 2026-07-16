/**
 * React Router decodes one URL-encoded path segment before exposing a wildcard
 * match. Keep the browser value intact here rather than decoding it again so
 * application IDs containing a literal percent sign remain addressable.
 */
export function gitOpsApplicationDetailIdFromRoute(pathRemainder: string | undefined): string | null {
  const applicationId = pathRemainder?.trim();
  return applicationId || null;
}

export function gitOpsApplicationDetailPath(applicationId: string): string {
  const normalized = applicationId.trim();
  if (!normalized) throw new RangeError("applicationId must not be empty");
  return `/gitops/detail/${encodeURIComponent(normalized)}`;
}
