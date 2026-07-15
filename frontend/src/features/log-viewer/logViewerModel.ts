import type { BottomDockLine } from "../bottom-dock/bottomDockState";

export type LogLevel = "error" | "warn" | "info" | "debug" | "unknown";
export type LogDisplayMode = "compact" | "expanded" | "raw";
export type StructuredLog =
  | { format: "json"; fields: Record<string, unknown> }
  | { format: "logfmt"; fields: Record<string, string> }
  | { format: "raw"; fields: null };

const LEVEL_KEYS = ["level", "severity", "log_level", "loglevel"];
const LOGFMT_PAIR = /(?:^|\s)([A-Za-z_][\w.-]*)=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+)/g;

export function detectLogLevel(line: string): LogLevel {
  const structured = parseStructuredLog(line);
  if (structured.fields) {
    for (const key of LEVEL_KEYS) {
      const value = structured.fields[key];
      const normalized = normalizeLevel(value);
      if (normalized !== "unknown") return normalized;
    }
  }

  const normalized = line.toLowerCase();
  if (/\b(fatal|panic|emerg|alert|crit(?:ical)?|error|err)\b/.test(normalized)) return "error";
  if (/\b(warn(?:ing)?|wrn)\b/.test(normalized)) return "warn";
  if (/\b(info|notice|inf)\b/.test(normalized)) return "info";
  if (/\b(debug|trace|dbg)\b/.test(normalized)) return "debug";
  return "unknown";
}

export function parseStructuredLog(line: string): StructuredLog {
  const trimmed = line.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const value: unknown = JSON.parse(trimmed);
      if (isRecord(value)) return { format: "json", fields: value };
    } catch {
      // A malformed JSON-looking line remains visible as raw text.
    }
  }

  const fields: Record<string, string> = {};
  let consumed = 0;
  for (const match of trimmed.matchAll(LOGFMT_PAIR)) {
    const [token, key, rawValue] = match;
    if (!key || rawValue === undefined) continue;
    fields[key] = unquoteLogfmt(rawValue);
    consumed += token.trim().length;
  }
  const pairCount = Object.keys(fields).length;
  if (pairCount >= 3 && consumed >= trimmed.length * 0.6) {
    return { format: "logfmt", fields };
  }
  return { format: "raw", fields: null };
}

export interface LogSearchResult {
  matches: (line: BottomDockLine) => boolean;
  error: string | null;
}

export function createLogSearch(
  query: string,
  isRegex: boolean,
  isCaseSensitive: boolean,
): LogSearchResult {
  if (!query) return { matches: () => true, error: null };
  if (isRegex) {
    try {
      const expression = new RegExp(query, isCaseSensitive ? "" : "i");
      return { matches: (line) => expression.test(searchableText(line)), error: null };
    } catch (error) {
      return {
        matches: () => false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  const needle = isCaseSensitive ? query : query.toLocaleLowerCase();
  return {
    matches: (line) => {
      const text = searchableText(line);
      return (isCaseSensitive ? text : text.toLocaleLowerCase()).includes(needle);
    },
    error: null,
  };
}

export function stringifyLogValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function searchableText(line: BottomDockLine): string {
  return [line.observedAt, line.pod, line.container, line.line].join("\n");
}

function normalizeLevel(value: unknown): LogLevel {
  if (typeof value === "number") {
    if (value >= 50) return "error";
    if (value >= 40) return "warn";
    if (value >= 30) return "info";
    if (value >= 10) return "debug";
    return "unknown";
  }
  if (typeof value !== "string") return "unknown";
  const normalized = value.toLowerCase();
  if (["fatal", "panic", "emerg", "alert", "critical", "crit", "error", "err"].includes(normalized)) {
    return "error";
  }
  if (["warning", "warn", "wrn"].includes(normalized)) return "warn";
  if (["info", "notice", "inf"].includes(normalized)) return "info";
  if (["debug", "trace", "dbg"].includes(normalized)) return "debug";
  return "unknown";
}

function unquoteLogfmt(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\([\\"'])/g, "$1");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
