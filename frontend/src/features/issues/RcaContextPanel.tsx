import { ExternalLink, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { parseProductFilterUrl, serializeProductFilterUrl } from "../filters/filterUrl";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { buttonVariants } from "../../shared/ui/primitives/button";
import type {
  RcaContextPort,
  RcaContextResult,
  RcaContextSubject,
} from "./rcaContextContract";

type RcaContextFrame =
  | { key: string; phase: "loading" }
  | { key: string; phase: "ready"; result: RcaContextResult }
  | { key: string; phase: "failed" };

export function RcaContextPanel({
  className,
  port,
  subject,
}: {
  className?: string;
  port: RcaContextPort;
  subject: RcaContextSubject;
}) {
  const { t } = useI18n();
  const { search } = useLocation();
  const subjectKey = rcaSubjectKey(subject);
  const [frame, setFrame] = useState<RcaContextFrame>({ key: subjectKey, phase: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void port.load(subject, controller.signal).then(
      (result) => {
        if (active) setFrame({ key: subjectKey, phase: "ready", result });
      },
      (error: unknown) => {
        if (active && !isAbortError(error)) setFrame({ key: subjectKey, phase: "failed" });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [port, subject, subjectKey]);

  const issuesHref = useMemo(() => {
    const filterState = parseProductFilterUrl(search).state;
    const namespaces = subject.scope.namespaces ?? [];
    return `/issues${serializeProductFilterUrl({
      ...filterState,
      common: {
        ...filterState.common,
        clusters: [subject.scope.clusterId],
        namespaces: namespaces.map((namespace) => ({
          clusterId: subject.scope.clusterId,
          namespace,
        })),
      },
    })}`;
  }, [search, subject.scope.clusterId, subject.scope.namespaces]);

  const currentFrame: RcaContextFrame = frame.key === subjectKey
    ? frame
    : { key: subjectKey, phase: "loading" };
  if (currentFrame.phase === "loading") return null;
  if (currentFrame.phase === "failed") {
    return <ContextNotice className={className} text={t("issues.context.failed")} />;
  }
  if (currentFrame.result.record === null) {
    return currentFrame.result.coverageAvailability === "available"
      ? null
      : <ContextNotice className={className} text={t("issues.context.coverageUnavailable")} />;
  }

  const { record } = currentFrame.result;
  return (
    <section
      aria-labelledby={`rca-context-title-${record.issue.id}`}
      className={cn("grid min-w-0 gap-3 border-y py-4", className)}
      data-slot="rca-context"
    >
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-status-warning" />
          <h2 className="truncate text-sm font-semibold" id={`rca-context-title-${record.issue.id}`}>
            {t("issues.context.title")}
          </h2>
        </div>
        {currentFrame.result.state === "partial" ? (
          <span className="text-xs text-muted-foreground">{t("common.state.partial")}</span>
        ) : null}
      </header>
      <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
        <ContextFact label={t("issues.surface.rootCause")} value={record.rootCause} />
        <ContextFact label={t("issues.report.narrative.impact")} value={record.impact} />
      </dl>
      {record.evidence.length > 0 ? (
        <ContextList label={t("issues.detail.section.evidence")} values={record.evidence} />
      ) : null}
      {record.missingEvidence.length > 0 ? (
        <ContextList label={t("issues.detail.section.missingEvidence")} values={record.missingEvidence} />
      ) : null}
      <Link className={cn(buttonVariants({ size: "sm", variant: "outline" }), "w-fit")} to={issuesHref}>
        {t("issues.context.open")}<ExternalLink aria-hidden="true" />
      </Link>
    </section>
  );
}

function ContextFact({ label, value }: { label: string; value: string | null }) {
  const { t } = useI18n();
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm">{value ?? t("common.value.unavailable")}</dd>
    </div>
  );
}

function ContextList({ label, values }: { label: string; values: readonly string[] }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
      <ul className="grid gap-1 text-sm">
        {values.map((value) => <li className="break-words" key={value}>• {value}</li>)}
      </ul>
    </div>
  );
}

function ContextNotice({ className, text }: { className?: string; text: string }) {
  return (
    <p className={cn("rounded-lg border border-dashed p-3 text-xs text-muted-foreground", className)} role="status">
      {text}
    </p>
  );
}

function rcaSubjectKey(subject: RcaContextSubject): string {
  return subject.kind === "incident"
    ? JSON.stringify([
        subject.kind,
        subject.scope.workspaceId,
        subject.scope.clusterId,
        subject.scope.namespaces ?? [],
        subject.scope.freshness,
        subject.incidentId,
        subject.correlationId,
      ])
    : [
        subject.kind,
        subject.scope.workspaceId,
        subject.scope.clusterId,
        subject.scope.namespaces ?? [],
        subject.scope.freshness,
        subject.resource.kind,
        subject.resource.namespace,
        subject.resource.name,
        subject.resource.uid,
      ].map((value) => JSON.stringify(value)).join(":");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
