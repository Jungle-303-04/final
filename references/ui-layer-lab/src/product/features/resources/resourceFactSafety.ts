import { ResourcesCanonicalError } from "./resourcesValidation";

export type ResourceFactWarningSink = (field: string) => void;

export const ignoreResourceFactWarning: ResourceFactWarningSink = () => undefined;

export function optionalFact<T>(
  field: string,
  fallback: T,
  project: () => T,
  warn: ResourceFactWarningSink,
): T {
  try {
    return project();
  } catch (error) {
    if (!(error instanceof ResourcesCanonicalError)) throw error;
    warn(field);
    return fallback;
  }
}
