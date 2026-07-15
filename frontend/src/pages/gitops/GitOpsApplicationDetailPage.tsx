import { GitBranch, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import type {
  GitOpsActionCapability,
  GitOpsApplicationDetail,
  GitOpsPort,
} from "../../features/gitops/gitOpsContract";
import { useI18n } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Surface } from "../../shared/ui/Surface";
import { Button } from "../../shared/ui/primitives/button";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";
import { WorkflowInlineHeading } from "./WorkflowInlineHeading";

export function GitOpsApplicationDetailPage({
  applicationId,
  port,
}: {
  applicationId: string;
  port: GitOpsPort;
}) {
  const { t } = useI18n();
  const [request, setRequest] = useState(0);
  const [detail, setDetail] = useState<GitOpsApplicationDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(() => {
    setDetail(null);
    setFailed(false);
    setRequest((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void port.getApplicationDetail(applicationId, controller.signal).then((next) => {
      setDetail(next);
    }).catch((error: unknown) => {
      if (!isAbortError(error)) setFailed(true);
    });
    return () => controller.abort();
  }, [applicationId, port, request]);

  if (detail === null && !failed) {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (detail === null) {
    return (
      <ProductStateScreen
        issue={{ code: "server", safeDetail: "GitOps application detail could not be loaded." }}
        kind="error"
        placement="content"
        retry={{ onRetry: reload, pending: false }}
      />
    );
  }

  return (
    <ProductPageFrame className="gap-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <WorkflowInlineHeading
            as="h1"
            icon={<GitBranch aria-hidden="true" />}
            title={detail.name}
            variant="page"
          />
          <p className="mt-1 text-sm text-muted-foreground">GitOps application evidence</p>
        </div>
        <Button aria-label={t("common.action.refresh")} onClick={reload} size="icon" type="button" variant="outline">
          <RefreshCw aria-hidden="true" />
        </Button>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <EvidenceCard title="Resource reference">
          <Fact label="Kind" value={`${detail.resource.apiGroup}/${detail.resource.version} · ${detail.resource.kind}`} />
          <Fact label="Name" value={detail.resource.name} />
          <Fact label="Namespace" value={detail.resource.namespace ?? t("common.value.unavailable")} />
          <Fact label="UID" value={<OverflowIdentity className="font-mono text-xs" value={detail.resource.uid} />} />
        </EvidenceCard>

        <EvidenceCard title="Target scope">
          <Fact label="Availability" value={availabilityLabel(detail.scope.availability, t)} />
          {detail.scope.scope ? <>
            <Fact label="Workspace" value={detail.scope.scope.workspaceId} />
            <Fact label="Cluster" value={detail.scope.scope.clusterId} />
            <Fact label="Namespaces" value={detail.scope.scope.namespaces.join(", ") || t("common.value.unavailable")} />
          </> : null}
          <Fact label="Reason" value={detail.scope.reasonCode ?? t("common.value.unavailable")} />
        </EvidenceCard>

        <EvidenceCard title="Source">
          <Fact label="Repository" value={detail.source.repositoryRef ?? t("common.value.unavailable")} />
          <Fact label="Branch" value={detail.source.defaultBranch ?? t("common.value.unavailable")} />
          <Fact label="Manifest" value={detail.source.manifestPath ?? t("common.value.unavailable")} />
        </EvidenceCard>

        <EvidenceCard title="Desired / live comparison">
          <Fact label="Availability" value={availabilityLabel(detail.desiredLiveDiff.availability, t)} />
          <Fact label="Source revision" value={detail.desiredLiveDiff.sourceRevision ?? t("common.value.unavailable")} />
          <Fact label="Live observation revision" value={detail.desiredLiveDiff.liveObservationRevision ?? t("common.value.unavailable")} />
          <Fact label="Reason" value={detail.desiredLiveDiff.reasonCode ?? t("common.value.unavailable")} />
        </EvidenceCard>

        <EvidenceCard title="Operation observation">
          <Fact label="Availability" value={availabilityLabel(detail.operation.availability, t)} />
          <Fact label="Progress" value={progressLabel(detail.operation.inProgress, t)} />
          <Fact label="Workflow" value={detail.operation.workflowRunId ?? t("common.value.unavailable")} />
          <Fact label="Status" value={detail.operation.status ?? t("common.value.unavailable")} />
          <Fact label="Reason" value={detail.operation.reasonCode ?? t("common.value.unavailable")} />
        </EvidenceCard>

        <EvidenceCard title="Provider actions">
          <div className="grid gap-3">
            {detail.capabilities.map((capability) => (
              <ActionCapability capability={capability} key={capability.action} />
            ))}
          </div>
        </EvidenceCard>
      </div>
    </ProductPageFrame>
  );
}

function EvidenceCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Surface as="div" className="min-w-0 p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">{children}</dl>
    </Surface>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 min-w-0 break-words text-sm">{value}</dd>
    </div>
  );
}

function ActionCapability({ capability }: { capability: GitOpsActionCapability }) {
  const { t } = useI18n();
  const label = capability.action === "refresh" ? t("common.action.refresh") : t("workflows.section.sync");
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 break-words text-xs text-muted-foreground">
          {capability.reasonCode ?? t("common.value.unavailable")}
        </p>
      </div>
      <Button
        aria-describedby={`gitops-capability-${capability.action}-reason`}
        disabled={!capability.enabled}
        title={capability.reasonCode ?? undefined}
        type="button"
        variant="outline"
      >
        {label}
      </Button>
      <span className="sr-only" id={`gitops-capability-${capability.action}-reason`}>
        {capability.reasonCode ?? t("common.value.unavailable")}
      </span>
    </div>
  );
}

function availabilityLabel(
  availability: GitOpsApplicationDetail["scope"]["availability"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (availability === "partial") return t("common.state.partial");
  if (availability === "unavailable") return t("common.state.unavailable");
  return "Available";
}

function progressLabel(value: boolean | null, t: ReturnType<typeof useI18n>["t"]): string {
  if (value === true) return t("common.action.inProgress");
  if (value === false) return "Not in progress";
  return t("common.value.unavailable");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
