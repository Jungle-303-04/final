export interface SearchModifier {
  key: string;
  value: string;
}

export interface ActiveSearchModifier {
  canon: string;
  partial: string;
  before: string;
}

export const DEFAULT_SEARCH_ALIASES: Record<string, string> = {
  ns: "ns",
  n: "ns",
  namespace: "ns",
  kind: "kind",
  k: "kind",
  label: "label",
  l: "label",
  image: "image",
  img: "image",
  cluster: "cluster",
  c: "cluster",
};

const MAX_SUGGESTIONS = 50;

export function activeSearchModifier(
  text: string,
  aliases: Record<string, string>,
): ActiveSearchModifier | null {
  const separator = text.lastIndexOf(" ");
  const before = separator < 0 ? "" : text.slice(0, separator + 1);
  const token = separator < 0 ? text : text.slice(separator + 1);
  const match = /^([a-zA-Z]+):(\S*)$/.exec(token);
  if (!match) return null;
  const canon = aliases[match[1].toLowerCase()];
  return canon ? { canon, partial: match[2], before } : null;
}

export function filterSearchModifierOptions(
  modifier: ActiveSearchModifier | null,
  modifierOptions?: Record<string, string[]>,
): string[] {
  if (!modifier) return [];
  const options = modifierOptions?.[modifier.canon];
  if (!options) return [];
  const partial = modifier.partial.toLowerCase();
  if (!partial) return options.slice(0, MAX_SUGGESTIONS);
  const prefix: string[] = [];
  const substring: string[] = [];
  for (const option of options) {
    const normalized = option.toLowerCase();
    if (normalized.startsWith(partial)) prefix.push(option);
    else if (normalized.includes(partial)) substring.push(option);
  }
  return [...prefix, ...substring].slice(0, MAX_SUGGESTIONS);
}
