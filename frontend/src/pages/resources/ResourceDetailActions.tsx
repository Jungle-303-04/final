import { RotateCcw, Scaling } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import type {
  ResourceActionCapabilityId,
  ResourceActionReceipt,
  ResourceActionsPort,
} from "../../features/resources/resourceCapabilitiesContract";
import type { ResourceDetail } from "../../features/resources/resourcesContract";
import { useI18n } from "../../shared/i18n";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../shared/ui/primitives/dialog";
import { Input } from "../../shared/ui/primitives/input";
import { Label } from "../../shared/ui/primitives/label";
import type { ResourceCapabilitiesFrame } from "./useResourceCapabilitiesDataFrame";

type Action = "restart" | "scale";

export function ResourceDetailActions({
  actionsPort,
  capabilities,
  detail,
}: {
  actionsPort: ResourceActionsPort;
  capabilities: ResourceCapabilitiesFrame;
  detail: ResourceDetail;
}) {
  const { t } = useI18n();
  const [dialog, setDialog] = useState<Action | null>(null);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<ResourceActionReceipt | null>(null);
  const [failed, setFailed] = useState(false);
  const [replicas, setReplicas] = useState(() => desiredReplicas(detail));
  const enabled = useMemo(() => enabledActions(capabilities, detail), [capabilities, detail]);

  if (enabled.size === 0) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (dialog === null || detail.identity.namespace === null || pending) return;
    setPending(true);
    setFailed(false);
    try {
      const result = dialog === "restart"
        ? await actionsPort.restartDeployment(
            detail.clusterId,
            detail.identity.namespace,
            detail.identity.name,
          )
        : await actionsPort.scaleDeployment(
            detail.clusterId,
            detail.identity.namespace,
            detail.identity.name,
            replicas,
          );
      setReceipt(result);
      setDialog(null);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-2" data-slot="resource-detail-actions">
      <div className="flex flex-wrap items-center gap-2">
        {enabled.has("deployment.restart") ? (
          <Button onClick={() => open("restart")} size="sm" type="button" variant="outline">
            <RotateCcw aria-hidden="true" />
            {t("resources.detail.action.restart")}
          </Button>
        ) : null}
        {enabled.has("deployment.scale") ? (
          <Button onClick={() => open("scale")} size="sm" type="button" variant="outline">
            <Scaling aria-hidden="true" />
            {t("resources.detail.action.scale")}
          </Button>
        ) : null}
      </div>
      {receipt ? (
        <output className="text-xs text-muted-foreground">
          {t("resources.detail.action.accepted", { id: receipt.correlationId })}
        </output>
      ) : null}
      <Dialog onOpenChange={(open) => !open && !pending && setDialog(null)} open={dialog !== null}>
        <DialogContent showCloseButton={!pending}>
          <form className="grid gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>
                {dialog === "scale"
                  ? t("resources.detail.action.scaleTitle")
                  : t("resources.detail.action.restartTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("resources.detail.action.confirm", { name: detail.identity.name })}
              </DialogDescription>
            </DialogHeader>
            {dialog === "scale" ? (
              <div className="grid gap-2">
                <Label htmlFor="resource-scale-replicas">
                  {t("resources.detail.action.replicas")}
                </Label>
                <Input
                  id="resource-scale-replicas"
                  max={100}
                  min={0}
                  onChange={(event) => setReplicas(Number(event.currentTarget.value))}
                  required
                  type="number"
                  value={replicas}
                />
              </div>
            ) : null}
            {failed ? (
              <Alert variant="destructive">
                <AlertDescription>{t("resources.detail.action.failed")}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              {pending ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {t("resources.detail.action.submitting")}
                </p>
              ) : (
                <>
                  <Button onClick={() => setDialog(null)} type="button" variant="outline">
                    {t("common.action.cancel")}
                  </Button>
                  <Button type="submit">{t("common.action.confirm")}</Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );

  function open(action: Action) {
    setFailed(false);
    setReceipt(null);
    setDialog(action);
  }
}

function enabledActions(
  frame: ResourceCapabilitiesFrame,
  detail: ResourceDetail,
): Set<ResourceActionCapabilityId> {
  if (frame.phase !== "ready") return new Set();
  const subject = frame.data.subject;
  if (
    subject.resourceId !== detail.resource.inventoryKey ||
    subject.clusterId !== detail.clusterId ||
    subject.kind !== detail.identity.kind ||
    subject.namespace !== detail.identity.namespace ||
    subject.name !== detail.identity.name
  ) return new Set();
  return new Set(frame.data.capabilities.map((item) => item.capabilityId));
}

function desiredReplicas(detail: ResourceDetail): number {
  const facts = detail.resource.facts;
  return facts.type === "workload" && facts.desiredReplicas !== null
    ? facts.desiredReplicas
    : 1;
}
