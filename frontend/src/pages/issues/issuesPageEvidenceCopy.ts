import {
  evidenceFallbackLabel,
  evidenceKindToken,
  evidenceRecordSources,
  evidenceRecordSubject,
  evidenceSourceKind,
  evidenceSummaryFacts,
  type EvidenceCountKind,
} from "../../features/issues/issueEvidencePresentation";
import type { MessageKey, TranslationFunction } from "../../shared/i18n/types";
import { humanizeFilterValue } from "../../shared/presentation/humanizeFilterValue";

export function translateOperationalValue(
  raw: string,
  messages: Readonly<Record<string, MessageKey>>,
  t: TranslationFunction,
): string {
  const normalized = raw.trim().toLowerCase().replace(/[.\s-]+/g, "_");
  const message = messages[normalized];
  return message === undefined ? humanizeFilterValue(raw) : t(message);
}

const EVIDENCE_COUNT_MESSAGE: Record<EvidenceCountKind, MessageKey> = {
  pods: "issues.evidence.count.pods",
  nodes: "issues.evidence.count.nodes",
  events: "issues.evidence.count.events",
  results: "issues.evidence.count.results",
  entries: "issues.evidence.count.entries",
  queries: "issues.evidence.count.queries",
};

export function evidenceSourceLabel(source: string, t: TranslationFunction): string {
  const key: Record<ReturnType<typeof evidenceSourceKind>, MessageKey | null> = {
    kubernetes: "issues.evidence.source.kubernetes",
    metrics: "issues.evidence.source.metrics",
    logs: "issues.evidence.source.logs",
    traces: "issues.evidence.source.traces",
    unknown: null,
  };
  const message = key[evidenceSourceKind(source)];
  return message === null ? evidenceFallbackLabel(source) : t(message);
}

export function evidenceKindLabel(kind: string, t: TranslationFunction): string {
  return evidenceKindToken(kind) === "rca_bundle"
    ? t("issues.evidence.kind.rcaBundle")
    : evidenceFallbackLabel(kind);
}

export function evidenceRecordLabel(summary: string, t: TranslationFunction): string {
  const subject = evidenceRecordSubject(summary);
  const sources = evidenceRecordSources(summary).map((source) => evidenceSourceLabel(source, t));
  if (subject !== null && sources.length > 0) return [subject, ...sources].join(" · ");
  return evidenceFallbackLabel(summary);
}

export function evidenceSummaryLabel(
  source: string,
  summary: string,
  t: TranslationFunction,
  formatNumber: (value: number | bigint, options?: Intl.NumberFormatOptions) => string,
): string {
  const facts = evidenceSummaryFacts(summary);
  if (facts.length > 0) {
    return facts.map(({ kind, count }) => t(EVIDENCE_COUNT_MESSAGE[kind], {
      count: formatNumber(count),
    })).join(" · ");
  }
  if (evidenceSourceKind(source) !== "unknown") return t("issues.evidence.summary.collected");
  return evidenceFallbackLabel(summary);
}

export function formatAuditTime(
  raw: string,
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string,
  t: TranslationFunction,
): string {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return t("issues.audit.timeUnknown");
  return formatDate(parsed, { dateStyle: "medium", timeStyle: "short" });
}
