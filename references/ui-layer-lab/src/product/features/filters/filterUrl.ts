import type {
  FilterHistoryMode,
  FilterMutationIntent,
} from "./filterContract";
import {
  parseProductFilterUrl,
  serializeProductFilterUrl,
} from "./filterUrlCodec";

export {
  parseProductFilterUrl,
  serializeProductFilterUrl,
} from "./filterUrlCodec";

export function canonicalizeProductFilterUrl(search: string): string {
  const parsed = parseProductFilterUrl(search);
  return serializeProductFilterUrl(parsed.state, parsed.detail);
}

export function productFilterNavigationHref(
  path: `/product${string}`,
  currentSearch: string,
): string {
  const parsed = parseProductFilterUrl(currentSearch);
  return `${path}${serializeProductFilterUrl(parsed.state)}`;
}

export function filterHistoryMode(intent: FilterMutationIntent): FilterHistoryMode {
  switch (intent) {
    case "chip-add":
    case "chip-remove":
    case "clear-labels":
    case "clear-filters":
      return "push";
    case "canonicalize":
    case "legacy-migration":
    case "typing":
      return "replace";
  }
}
