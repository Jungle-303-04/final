export type FreshnessBucket =
  | { unit: "seconds"; value: number }
  | { unit: "minutes"; value: number }
  | { unit: "hours"; value: number }
  | { unit: "days"; value: number };

export function freshnessBucket(elapsedMilliseconds: number): FreshnessBucket {
  const elapsed = Math.max(0, elapsedMilliseconds);
  if (elapsed < 60_000) {
    return { unit: "seconds", value: Math.floor(elapsed / 1_000) };
  }
  if (elapsed < 3_600_000) {
    return { unit: "minutes", value: Math.floor(elapsed / 60_000) };
  }
  if (elapsed < 86_400_000) {
    return { unit: "hours", value: Math.floor(elapsed / 3_600_000) };
  }
  return { unit: "days", value: Math.floor(elapsed / 86_400_000) };
}

export function msToNextFreshnessBucket(elapsedMilliseconds: number): number {
  const elapsed = Math.max(0, elapsedMilliseconds);
  if (elapsed < 60_000) return 1_000 - (elapsed % 1_000);
  if (elapsed < 3_600_000) return 60_000 - (elapsed % 60_000);
  if (elapsed < 86_400_000) return 3_600_000 - (elapsed % 3_600_000);
  return 86_400_000 - (elapsed % 86_400_000);
}
