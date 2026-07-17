import { applicationMessageKeys } from "./keys/applications";
import type { TranslationFunction } from "./types";

type ApplicationsCopy = {
  readonly [Name in keyof typeof applicationMessageKeys]: string;
};

const applicationsCopyCache = new WeakMap<TranslationFunction, ApplicationsCopy>();

/**
 * Keeps the established surface-oriented property names while sourcing every
 * product-owned message from the typed locale catalogs.
 */
export function applicationsCopy(t: TranslationFunction): ApplicationsCopy {
  const cached = applicationsCopyCache.get(t);
  if (cached) return cached;
  const copy = Object.fromEntries(
    Object.entries(applicationMessageKeys).map(([name, key]) => [name, t(key)]),
  ) as ApplicationsCopy;
  applicationsCopyCache.set(t, copy);
  return copy;
}
