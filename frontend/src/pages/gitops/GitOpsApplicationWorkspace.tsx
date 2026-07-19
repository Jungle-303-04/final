import { GitBranch, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { RcaContextPanel } from "../../features/issues/RcaContextPanel";
import type { RcaContextPort } from "../../features/issues/rcaContextContract";
import {
  GitOpsPortFailure,
  type GitOpsApplicationDetail,
  type GitOpsPort,
  type GitOpsResourceLocator,
  type GitOpsSyncTarget,
} from "../../features/gitops/gitOpsContract";
import { useI18n } from "../../shared/i18n";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Button } from "../../shared/ui/primitives/button";
import { GitOpsApplicationEvidence } from "./GitOpsApplicationEvidence";
import { GitOpsResourceWorkspace } from "./GitOpsResourceWorkspace";

type ApplicationFrame =
  | { key: string; phase: "loading" }
  | { failure: GitOpsPortFailure; key: string; phase: "failed" }
  | { detail: GitOpsApplicationDetail; key: string; phase: "ready" };

export function GitOpsApplicationWorkspace({
  applicationId,
  port,
  rcaContextPort,
  row,
}: {
  applicationId: string;
  port: GitOpsPort;
  rcaContextPort: RcaContextPort;
  row: GitOpsSyncTarget | null;
}) {
  const { t } = useI18n();
  const [request, setRequest] = useState(0);
  const requestKey = `${applicationId}:${request}`;
  const [frame, setFrame] = useState<ApplicationFrame>({ key: requestKey, phase: "loading" });
  const reload = useCallback(() => setRequest((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    void port.getApplicationDetail(applicationId, controller.signal).then((detail) => {
      if (!controller.signal.aborted) setFrame({ detail, key: requestKey, phase: "ready" });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && !isAbortError(error)) {
        setFrame({ failure: toFailure(error), key: requestKey, phase: "failed" });
      }
    });
    return () => controller.abort();
  }, [applicationId, port, requestKey]);

  const currentFrame = frame.key === requestKey
    ? frame
    : { key: requestKey, phase: "loading" as const };
  if (currentFrame.phase === "loading") return <ProductStateScreen kind="loading" placement="content" />;
  if (currentFrame.phase === "failed") return <FailureState failure={currentFrame.failure} onRetry={reload} />;

  const locator = row?.resourceLocator ?? locatorFromDetail(currentFrame.detail);
  return (
    <div className="grid min-w-0 animate-in gap-3 px-4 py-3 fade-in-0 duration-(--motion-soft) ease-(--ease-soft) motion-reduce:animate-none">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background-subtle text-caption-foreground">
            <GitBranch aria-hidden="true" className="size-4" />
          </span>
          <span className="grid min-w-0 gap-0.5">
            <strong className="truncate text-body-strong font-bold">{currentFrame.detail.name}</strong>
            <span className="truncate text-caption text-caption-foreground">{t("workflows.detail.evidence")}</span>
          </span>
        </span>
        <Button aria-label={t("common.action.refresh")} onClick={reload} size="icon-sm" type="button" variant="ghost">
          <RefreshCw aria-hidden="true" />
        </Button>
      </header>
      <GitOpsApplicationEvidence detail={currentFrame.detail} />
      {locator ? (
        <GitOpsResourceWorkspace
          key={locatorKey(locator)}
          locator={locator}
          port={port}
          rcaContextPort={rcaContextPort}
        />
      ) : currentFrame.detail.scope.scope ? (
        <RcaContextPanel
          port={rcaContextPort}
          subject={{ kind: "resource", scope: currentFrame.detail.scope.scope, resource: currentFrame.detail.resource }}
        />
      ) : (
        <p className="m-0 rounded-lg border border-dashed border-border-subtle p-3 text-label-2 text-caption-foreground">
          {t("workflows.detail.reason.bindingScopeUnavailable")}
        </p>
      )}
    </div>
  );
}

function locatorFromDetail(detail: GitOpsApplicationDetail): GitOpsResourceLocator | null {
  if (!detail.scope.scope || detail.resource.namespace === null) return null;
  return {
    apiVersion: detail.resource.apiGroup
      ? `${detail.resource.apiGroup}/${detail.resource.version}`
      : detail.resource.version,
    clusterId: detail.scope.scope.clusterId,
    kind: detail.resource.kind,
    name: detail.resource.name,
    namespace: detail.resource.namespace,
  };
}

function FailureState({ failure, onRetry }: { failure: GitOpsPortFailure; onRetry: () => void }) {
  if (failure.code === "forbidden" || failure.code === "unauthorized") {
    return <ProductStateScreen issue={{ code: "forbidden" }} kind="forbidden" placement="content" />;
  }
  if (failure.code === "not-found") return <ProductStateScreen kind="not-found" placement="content" />;
  if (failure.code === "offline") {
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
      issue={{ code: failure.code === "invalid-response" ? "invalid-response" : "server" }}
      kind="error"
      placement="content"
      retry={{ onRetry, pending: false }}
    />
  );
}

function toFailure(error: unknown): GitOpsPortFailure {
  return error instanceof GitOpsPortFailure ? error : new GitOpsPortFailure("error");
}

function locatorKey(locator: GitOpsResourceLocator): string {
  return [locator.clusterId, locator.apiVersion, locator.kind, locator.namespace, locator.name].join(":");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
