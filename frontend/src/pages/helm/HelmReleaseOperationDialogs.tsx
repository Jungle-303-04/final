import { useEffect, useRef, useState } from "react";

import {
  HelmPortFailure,
  type HelmPort,
  type HelmReleaseDetail,
} from "../../features/helm/helmContract";
import { HELM_COPY } from "../../features/helm/helmCopy";
import { useOptionalOperationStatusStore } from "../../features/operations/OperationStatusStore";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import { ConfirmationDialog } from "../../shared/ui/primitives/confirmation-dialog";

type Operation = "rollback" | "uninstall";

export function HelmReleaseOperationDialogs({
  detail,
  onAccepted,
  port,
}: {
  detail: HelmReleaseDetail;
  onAccepted: () => void;
  port: HelmPort;
}) {
  const operationStore = useOptionalOperationStatusStore();
  const [operation, setOperation] = useState<Operation | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const expectedRevision = detail.release.revision;
  const rollbackRevisions = [...new Set(detail.history
    .map((entry) => entry.revision)
    .filter((revision): revision is number => (
      revision !== null && expectedRevision !== null && revision < expectedRevision
    )))]
    .sort((left, right) => right - left);
  const [rollbackRevision, setRollbackRevision] = useState(rollbackRevisions[0] ?? null);

  useEffect(() => () => requestRef.current?.abort(), []);

  if (
    detail.commands.availability !== "available"
    || expectedRevision === null
    || !detail.commands.actions.includes("rollback")
    || !detail.commands.actions.includes("uninstall")
  ) return null;

  const changeOpen = (open: boolean) => {
    if (!open && pending) return;
    if (!open) requestRef.current?.abort();
    setFailure(null);
    setOperation(open ? operation : null);
  };
  const open = (next: Operation) => {
    setFailure(null);
    setRollbackRevision(rollbackRevisions[0] ?? null);
    setOperation(next);
  };
  const confirm = async () => {
    if (operation === null || pending) return;
    if (operation === "rollback" && rollbackRevision === null) return;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setPending(true);
    setFailure(null);
    try {
      const base = {
        clusterId: detail.release.scope.clusterId,
        namespace: detail.release.storageNamespace,
        releaseName: detail.release.name,
        expectedRevision,
        confirmation: true as const,
      };
      const receipt = operation === "rollback"
        ? await port.rollbackRelease({
          ...base,
          revision: rollbackRevision as number,
          reason: HELM_COPY.rollbackReason(detail.release.name, rollbackRevision as number),
        }, controller.signal)
        : await port.uninstallRelease({
          ...base,
          reason: HELM_COPY.uninstallReason(detail.release.name),
        }, controller.signal);
      operationStore?.start(receipt.commandId);
      if (!operationStore) setFailure(HELM_COPY.operationStreamUnavailable);
      onAccepted();
      setOperation(null);
    } catch (error) {
      setFailure(operationFailureCopy(error, operation));
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setPending(false);
    }
  };
  const rollback = operation === "rollback";

  return (
    <>
      <Button disabled={rollbackRevisions.length === 0} onClick={() => open("rollback")} size="sm" type="button" variant="outline">
        {HELM_COPY.rollback}
      </Button>
      <Button onClick={() => open("uninstall")} size="sm" type="button" variant="destructive">
        {HELM_COPY.uninstall}
      </Button>
      <ConfirmationDialog
        cancelLabel={HELM_COPY.chartSourceCancel}
        confirmDisabled={rollback && rollbackRevision === null}
        confirmLabel={pending
          ? HELM_COPY.operationPending
          : rollback ? HELM_COPY.rollbackConfirm : HELM_COPY.uninstallConfirm}
        description={rollback ? HELM_COPY.rollbackDescription : HELM_COPY.uninstallDescription}
        details={HELM_COPY.operationDiff(
          detail.release.scope.clusterId,
          detail.release.storageNamespace,
          detail.release.name,
          expectedRevision,
          rollback ? rollbackRevision : null,
        )}
        onConfirm={() => void confirm()}
        onOpenChange={changeOpen}
        open={operation !== null}
        pending={pending}
        title={rollback ? HELM_COPY.rollbackTitle : HELM_COPY.uninstallTitle}
        variant={rollback ? "warning" : "destructive"}
      >
        {rollback ? (
          <label className="grid gap-1 text-sm" htmlFor="helm-rollback-revision">
            <span className="font-medium">{HELM_COPY.rollbackRevision}</span>
            <select
              className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm text-foreground"
              id="helm-rollback-revision"
              onChange={(event) => setRollbackRevision(Number(event.target.value))}
              value={rollbackRevision ?? ""}
            >
              {rollbackRevisions.map((revision) => (
                <option key={revision} value={revision}>{revision}</option>
              ))}
            </select>
          </label>
        ) : null}
        {failure ? (
          <Alert variant="destructive"><AlertDescription>{failure}</AlertDescription></Alert>
        ) : null}
      </ConfirmationDialog>
    </>
  );
}

function operationFailureCopy(error: unknown, operation: Operation): string {
  if (error instanceof HelmPortFailure) {
    if (error.code === "forbidden" || error.code === "unauthorized") return HELM_COPY.operationForbidden;
    if (error.code === "invalid-request" || error.code === "not-found") return HELM_COPY.operationStale;
  }
  return operation === "rollback" ? HELM_COPY.rollbackFailed : HELM_COPY.uninstallFailed;
}
