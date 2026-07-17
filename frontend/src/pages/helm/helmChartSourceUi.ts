import { HelmPortFailure } from "../../features/helm/helmContract";

export function toHelmFailure(error: unknown): HelmPortFailure {
  return error instanceof HelmPortFailure ? error : new HelmPortFailure("error");
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
