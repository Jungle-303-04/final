import { useEffect, useRef, useState } from "react";

import {
  type HelmChartSource,
  type HelmPort,
  HelmPortFailure,
} from "../../features/helm/helmContract";
import { useHelmCopy, type HelmCopy } from "../../features/helm/helmCopy";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { ConfirmationDialog } from "../../shared/ui/primitives/confirmation-dialog";
import { isAbortError, toHelmFailure } from "./helmChartSourceUi";

export function HelmChartSourceDeleteDialog({
  onDeleted,
  onOpenChange,
  open,
  port,
  source,
}: {
  onDeleted: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  port: HelmPort;
  source: HelmChartSource;
}) {
  const copy = useHelmCopy();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<HelmPortFailure | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const changeOpen = (nextOpen: boolean) => {
    if (pending) return;
    if (!nextOpen) {
      requestRef.current?.abort();
      setFailure(null);
    }
    onOpenChange(nextOpen);
  };

  const confirm = async () => {
    if (pending) return;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setPending(true);
    setFailure(null);
    try {
      await port.deleteChartSource({
        id: source.id,
        provider: source.provider,
        name: source.name,
        reference: source.reference,
      }, controller.signal);
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPending(false);
      }
      onDeleted();
      onOpenChange(false);
    } catch (error) {
      if (!isAbortError(error)) setFailure(toHelmFailure(error));
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPending(false);
      }
    }
  };

  return (
    <ConfirmationDialog
      cancelLabel={copy.chartSourceCancel}
      confirmLabel={pending ? copy.chartSourceDeletePending : copy.chartSourceDeleteConfirm}
      description={copy.chartSourceDeleteDescription}
      details={`${source.name}\n${source.reference}`}
      onConfirm={() => void confirm()}
      onOpenChange={changeOpen}
      open={open}
      pending={pending}
      title={copy.chartSourceDelete}
    >
      {failure ? (
        <Alert variant="destructive">
          <AlertDescription>{deleteFailureCopy(failure, copy)}</AlertDescription>
        </Alert>
      ) : null}
    </ConfirmationDialog>
  );
}

function deleteFailureCopy(failure: HelmPortFailure, copy: HelmCopy): string {
  if (failure.code === "forbidden" || failure.code === "unauthorized") {
    return copy.chartSourceDeleteForbidden;
  }
  if (failure.code === "not-found") return copy.chartSourceDeleteNotFound;
  if (failure.code === "invalid-request") return copy.chartSourceDeleteConflict;
  return copy.chartSourceDeleteFailed;
}
