export type ClassValue = string | false | null | undefined;

/**
 * Joins component-owned class names without introducing a styling runtime.
 * Layout consumers may append a className; visual variants remain component API.
 */
export function cx(...values: readonly ClassValue[]): string {
  return values.filter((value): value is string => typeof value === "string" && value.length > 0).join(" ");
}
