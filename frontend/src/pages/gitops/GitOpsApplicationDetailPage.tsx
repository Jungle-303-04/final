import { GitBranch, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import {
  GitOpsPortFailure,
  type GitOpsActionCapability,
  type GitOpsApplicationDetail,
  type GitOpsAvailability,
  type GitOpsPort,
  type GitOpsReasonCode,
} from "../../features/gitops/gitOpsContract";
import {
  gitOpsReasonLabel,
} from "./gitOpsDetailPresentation";
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
  const [failure, setFailure] = useState<GitOpsPortFailure | null>(null);
  const reload = useCallback(() => {
    setDetail(null);
    setFailure(null);
    setRequest((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void port.getApplicationDetail(applicationId, controller.signal).then((next) => {
      setDetail(next);
    }).catch((error: unknown) => {
      if (!isAbortError(error)) setFailure(toGitOpsPortFailure(error));
    });
    return () => controller.abort();
  }, [applicationId, port, request]);

  if (detail === null && failure === null) {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (detail === null) {
    return <GitOpsApplicationDetailFailure failure={failure} onRetry={reload} />;
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
          <p className="mt-1 text-sm text-muted-foreground">{t("workflows.detail.evidence")}</p>
        </div>
        <Button aria-label={t("common.action.refresh")} onClick={reload} size="icon" type="button" variant="outline">
          <RefreshCw aria-hidden="true" />
        </Button>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <EvidenceCard title={t("workflows.detail.resource")}>
          <Fact label={t("workflows.detail.kind")} value={`${detail.resource.apiGroup}/${detail.resource.version} · ${detail.resource.kind}`} />
          <Fact label={t("workflows.target.name")} value={detail.resource.name} />
          <Fact label={t("workflows.details.namespace")} value={detail.resource.namespace ?? t("common.value.unavailable")} />
          <Fact label={t("workflows.detail.uid")} value={<OverflowIdentity className="font-mono text-xs" value={detail.resource.uid} />} />
        </EvidenceCard>

        <EvidenceCard
          availability={detail.scope.availability}
          reasonCode={detail.scope.reasonCode}
          title={t("workflows.detail.scope")}
        >
          <Fact label={t("workflows.detail.availability")} value={availabilityLabel(detail.scope.availability, t)} />
          {detail.scope.scope ? <>
            <Fact label={t("workflows.detail.workspace")} value={detail.scope.scope.workspaceId} />
            <Fact label={t("workflows.detail.cluster")} value={detail.scope.scope.clusterId} />
            <Fact label={t("workflows.detail.namespaces")} value={detail.scope.scope.namespaces.join(", ") || t("common.value.unavailable")} />
          </> : null}
          <Fact label={t("workflows.detail.reason")} value={gitOpsReasonLabel(detail.scope.reasonCode, t)} />
        </EvidenceCard>

        <EvidenceCard title={t("workflows.detail.source")}>
          <Fact label={t("workflows.detail.repository")} value={detail.source.repositoryRef ?? t("common.value.unavailable")} />
          <Fact label={t("workflows.detail.branch")} value={detail.source.defaultBranch ?? t("common.value.unavailable")} />
          <Fact label={t("workflows.detail.manifest")} value={detail.source.manifestPath ?? t("common.value.unavailable")} />
        </EvidenceCard>

        <EvidenceCard
          availability={detail.desiredLiveDiff.availability}
          reasonCode={detail.desiredLiveDiff.reasonCode}
          title={t("workflows.detail.desiredLive")}
          unavailableStatusLabel={t("workflows.detail.integrationUnavailable")}
        >
          <Fact label={t("workflows.detail.availability")} value={availabilityLabel(detail.desiredLiveDiff.availability, t)} />
          <Fact label={t("workflows.detail.sourceRevision")} value={detail.desiredLiveDiff.sourceRevision ?? t("common.value.unavailable")} />
          <Fact label={t("workflows.detail.liveObservationRevision")} value={detail.desiredLiveDiff.liveObservationRevision ?? t("common.value.unavailable")} />
          <Fact label={t("workflows.detail.reason")} value={gitOpsReasonLabel(detail.desiredLiveDiff.reasonCode, t)} />
        </EvidenceCard>

        <EvidenceCard
          availability={detail.operation.availability}
          reasonCode={detail.operation.reasonCode}
          title={t("workflows.detail.operation")}
          unavailableStatusLabel={t("workflows.detail.integrationUnavailable")}
        >
          <Fact label={t("workflows.detail.availability")} value={availabilityLabel(detail.operation.availability, t)} />
          <Fact label={t("workflows.detail.progress")} value={progressLabel(detail.operation.inProgress, t)} />
          <Fact label={t("workflows.detail.workflow")} value={detail.operation.workflowRunId ?? t("common.value.unavailable")} />
          <Fact label={t("workflows.detail.status")} value={detail.operation.status ?? t("common.value.unavailable")} />
          <Fact label={t("workflows.detail.reason")} value={gitOpsReasonLabel(detail.operation.reasonCode, t)} />
        </EvidenceCard>

        <EvidenceCard title={t("workflows.detail.capabilities")}>
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

function EvidenceCard({
  availability,
  children,
  reasonCode,
  title,
  unavailableStatusLabel,
}: {
  availability?: GitOpsAvailability;
  children: ReactNode;
  reasonCode?: GitOpsReasonCode | null;
  title: string;
  unavailableStatusLabel?: string;
}) {
  return (
    <Surface as="div" className="min-w-0 p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {availability ? (
        <EvidenceAvailability
          availability={availability}
          reasonCode={reasonCode ?? null}
          unavailableStatusLabel={unavailableStatusLabel}
        />
      ) : null}
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
  const label = capability.action === "refresh" ? t("common.action.refresh") : t("workflows.detail.action.sync");
  const reason = capability.reasonCode === null
    ? t("workflows.detail.executionUnavailable")
    : gitOpsReasonLabel(capability.reasonCode, t);
  const status = capability.operationBlocked
    ? t("workflows.detail.operationInProgress")
    : capability.authorization === "denied"
      ? t("common.state.forbidden")
      : capability.availability === "unavailable"
        ? t("workflows.detail.integrationUnavailable")
        : availabilityLabel(capability.availability, t);
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 break-words text-xs text-muted-foreground">
          {status} · {reason}
        </p>
      </div>
      <Button
        aria-describedby={`gitops-capability-${capability.action}-reason`}
        disabled
        title={reason}
        type="button"
        variant="outline"
      >
        {label}
      </Button>
      <span className="sr-only" id={`gitops-capability-${capability.action}-reason`}>
        {reason}
      </span>
    </div>
  );
}

function availabilityLabel(
  availability: GitOpsAvailability,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (availability === "partial") return t("common.state.partial");
  if (availability === "unavailable") return t("common.state.unavailable");
  return t("workflows.detail.available");
}

function progressLabel(value: boolean | null, t: ReturnType<typeof useI18n>["t"]): string {
  if (value === true) return t("workflows.detail.operationInProgress");
  if (value === false) return t("workflows.detail.notInProgress");
  return t("common.value.unavailable");
}

function EvidenceAvailability({
  availability,
  reasonCode,
  unavailableStatusLabel,
}: {
  availability: GitOpsAvailability;
  reasonCode: GitOpsReasonCode | null;
  unavailableStatusLabel?: string;
}) {
  const { t } = useI18n();
  if (availability === "available") return null;
  const label = availability === "unavailable"
    ? unavailableStatusLabel ?? t("common.state.unavailable")
    : t("common.state.partial");
  return (
    <p className="mt-2 break-words text-xs text-muted-foreground">
      {label}{reasonCode ? ` · ${gitOpsReasonLabel(reasonCode, t)}` : ""}
    </p>
  );
}

function GitOpsApplicationDetailFailure({
  failure,
  onRetry,
}: {
  failure: GitOpsPortFailure | null;
  onRetry: () => void;
}) {
  if (failure?.code === "forbidden" || failure?.code === "unauthorized") {
    return <ProductStateScreen issue={{ code: "forbidden" }} kind="forbidden" placement="content" />;
  }
  if (failure?.code === "not-found") {
    return <ProductStateScreen kind="not-found" placement="content" />;
  }
  if (failure?.code === "offline") {
    return (
      <ProductStateScreen
        issue={{ code: "network" }}
        kind="offline"
        placement="content"
        retry={{ onRetry, pending: false }}
      />
    );
  }
  return (
    <ProductStateScreen
      issue={{ code: failure?.code === "invalid-response" ? "invalid-response" : "server" }}
      kind="error"
      placement="content"
      retry={{ onRetry, pending: false }}
    />
  );
}

function toGitOpsPortFailure(error: unknown): GitOpsPortFailure {
  return error instanceof GitOpsPortFailure ? error : new GitOpsPortFailure("error");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
