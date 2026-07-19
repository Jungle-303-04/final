export type WizardStep = 1 | 2 | 3;

export type ConnectPhase =
  | "idle"
  | "submitting"
  | "waiting"
  | "reissuing"
  | "finishing"
  | "connected"
  | "expired"
  | "failed";

export function normalizeDisplayName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
