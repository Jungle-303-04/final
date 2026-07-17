export function hasUrlOriginChanged(nextUrl: string, currentUrl: string | null): boolean {
  if (currentUrl === null) return false;
  try {
    return new URL(nextUrl).origin !== new URL(currentUrl).origin;
  } catch {
    return true;
  }
}
