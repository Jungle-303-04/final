import { humanizeFilterValue } from "../../shared/presentation/humanizeFilterValue";

export type EvidenceCountKind =
  | "pods"
  | "nodes"
  | "events"
  | "results"
  | "entries"
  | "queries";

export interface EvidenceSummaryFact {
  kind: EvidenceCountKind;
  count: number;
}

const KNOWN_COUNT = /(?:^|[,\s])(pods|nodes|events|results|entries)=(\d+)(?=,|\s|$)/g;

export function evidenceSourceKind(value: string):
  | "kubernetes"
  | "metrics"
  | "logs"
  | "traces"
  | "unknown" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "kubernetes" || normalized === "metrics" || normalized === "logs" || normalized === "traces") {
    return normalized;
  }
  return "unknown";
}

export function evidenceSummaryFacts(summary: string): EvidenceSummaryFact[] {
  const facts: EvidenceSummaryFact[] = [];
  const seen = new Set<EvidenceCountKind>();
  for (const match of summary.matchAll(KNOWN_COUNT)) {
    const kind = match[1] as EvidenceCountKind;
    const count = Number(match[2]);
    if (!Number.isSafeInteger(count) || count < 0 || seen.has(kind)) continue;
    seen.add(kind);
    facts.push({ kind, count });
  }

  const queryList = /(?:^|[,\s])queries=([^\s]+)/.exec(summary)?.[1];
  if (queryList !== undefined && !seen.has("queries")) {
    const count = queryList.split(",").filter((value) => value.trim().length > 0).length;
    if (count > 0) facts.push({ kind: "queries", count });
  }
  return facts;
}

export function evidenceRecordSources(summary: string): string[] {
  const separator = summary.indexOf(":");
  if (separator === -1) return [];
  return summary
    .slice(separator + 1)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => evidenceSourceKind(value) !== "unknown");
}

export function evidenceRecordSubject(summary: string): string | null {
  const separator = summary.indexOf(":");
  const value = (separator === -1 ? "" : summary.slice(0, separator)).trim();
  return value || null;
}

export function evidenceKindToken(value: string): "rca_bundle" | "unknown" {
  return value.trim().toLowerCase() === "rca_bundle" ? "rca_bundle" : "unknown";
}

export function evidenceCollectorLabel(value: string): string {
  const normalized = value.trim().replace(/@unknown$/i, "");
  if (/^cluster-agent$/i.test(normalized)) return "cluster-agent";
  return humanizeFilterValue(normalized || value);
}

export function evidenceFallbackLabel(value: string): string {
  const normalized = value.trim();
  return /\s/u.test(normalized) ? normalized : humanizeFilterValue(normalized);
}
