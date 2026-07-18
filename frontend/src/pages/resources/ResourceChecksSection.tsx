import { ChevronDown, ShieldCheck, TriangleAlert } from "lucide-react";

import type { ChecksPort } from "../../features/checks/checksContract";
import {
  exactResourceRef,
  sameResourceRef,
} from "../../features/resources/resourceApiIdentity";
import type { ResourceDetail } from "../../features/resources/resourcesContract";
import type { ResourceRef } from "../../shared/parity/referenceParity";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import { useChecksOverview } from "../checks/useChecksData";

export function ResourceChecksSection({
  detail,
  port,
}: {
  detail: ResourceDetail;
  port: ChecksPort;
}) {
  const resource = exactResourceRef(detail);
  if (resource === null) return null;
  return (
    <ExactResourceChecks
      clusterId={detail.clusterId}
      port={port}
      resource={resource}
    />
  );
}

function ExactResourceChecks({
  clusterId,
  port,
  resource,
}: {
  clusterId: string;
  port: ChecksPort;
  resource: ResourceRef;
}) {
  const { t } = useI18n();
  const request = {
    clusterIds: [clusterId],
    namespaces: resource.namespace === null
      ? []
      : [`${clusterId}/${resource.namespace}`],
    resource,
  } as const;
  const { frame } = useChecksOverview(port, request);
  if (frame.phase === "idle" || frame.phase === "loading") {
    return <Skeleton aria-label={t("resources.detail.checks.loading")} className="h-20 w-full" />;
  }
  if (frame.phase === "failed") {
    return <ChecksStatus clusterId={clusterId} text={t("resources.detail.checks.failed")} />;
  }
  if (frame.data.resultSet.availability === "unavailable") {
    return <ChecksStatus clusterId={clusterId} text={t("resources.detail.checks.unavailable")} />;
  }
  const findings = frame.data.resultSet.checks.filter(
    (finding) => finding.clusterId === clusterId && sameResourceRef(finding.resource, resource),
  );
  if (findings.length === 0) return null;
  return (
    <section
      aria-labelledby="resource-checks-title"
      className="grid min-w-0 gap-3 rounded-xl border bg-card p-4 shadow-xs"
      data-slot="resource-checks"
    >
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 font-heading font-semibold" id="resource-checks-title">
          <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
          {t("resources.detail.checks.count", { count: findings.length })}
        </h3>
        {frame.data.resultSet.availability === "partial" ? (
          <Badge variant="warning">{t("resources.detail.checks.partial")}</Badge>
        ) : null}
      </header>
      <div className="grid gap-2">
        {findings.map((finding) => (
          <details className="group min-w-0 overflow-hidden rounded-lg border" key={finding.findingId}>
            <summary className="flex min-w-0 cursor-pointer list-none items-start gap-3 p-3 marker:content-none">
              <TriangleAlert
                aria-hidden="true"
                className={finding.severity === "danger"
                  ? "mt-0.5 size-4 shrink-0 text-destructive"
                  : "mt-0.5 size-4 shrink-0 text-status-warning"}
              />
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="break-words text-sm font-medium">{finding.message}</span>
                <span className="flex min-w-0 flex-wrap gap-2">
                  <Badge variant={finding.severity === "danger" ? "destructive" : "warning"}>
                    {finding.category}
                  </Badge>
                  <Badge variant="outline">{finding.checkId}</Badge>
                </span>
              </span>
              <ChevronDown aria-hidden="true" className="mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <div className="border-t px-3 py-3 text-xs text-muted-foreground">
              <a
                className="font-medium text-primary underline-offset-4 hover:underline"
                href={`/checks?clusters=${encodeURIComponent(clusterId)}`}
              >
                {t("resources.detail.checks.open")}
              </a>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function ChecksStatus({ clusterId, text }: { clusterId: string; text: string }) {
  const { t } = useI18n();
  return (
    <section className="rounded-xl border border-status-warning/30 bg-status-warning/5 p-4" role="status">
      <h3 className="font-medium">{t("resources.detail.checks.title")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      <a
        className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
        href={`/checks?clusters=${encodeURIComponent(clusterId)}`}
      >
        {t("resources.detail.checks.open")}
      </a>
    </section>
  );
}
