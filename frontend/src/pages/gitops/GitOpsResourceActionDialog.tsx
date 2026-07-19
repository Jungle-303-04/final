import { useState, type FormEvent } from "react";

import type {
  GitOpsPort,
  GitOpsResourceAction,
  GitOpsResourceInsights,
  GitOpsResourceLocator,
  GitOpsSyncOptions,
} from "../../features/gitops/gitOpsContract";
import type { CommandReceipt } from "../../shared/parity/referenceParity";
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

type SelectedResource = GitOpsSyncOptions["resources"][number];

export function GitOpsResourceActionDialog({
  action,
  insights,
  locator,
  onAccepted,
  onClose,
  port,
  selectedResources,
}: {
  action: GitOpsResourceAction | null;
  insights: GitOpsResourceInsights;
  locator: GitOpsResourceLocator;
  onAccepted: (receipt: CommandReceipt) => void;
  onClose: () => void;
  port: GitOpsPort;
  selectedResources: SelectedResource[];
}) {
  const { t } = useI18n();
  const [applyOnly, setApplyOnly] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [failed, setFailed] = useState(false);
  const [force, setForce] = useState(false);
  const [hardRefresh, setHardRefresh] = useState(false);
  const [pending, setPending] = useState(false);
  const [prune, setPrune] = useState(true);
  const [reason, setReason] = useState("");
  const [syncOptions, setSyncOptions] = useState("");
  const [syncRevision, setSyncRevision] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!action || !port.executeResourceAction || pending || !reason.trim()) return;
    setPending(true);
    setFailed(false);
    try {
      const receipt = await port.executeResourceAction(locator, {
        action,
        confirmation: true,
        idempotencyKey: crypto.randomUUID(),
        insights,
        reason: reason.trim(),
        ...(action === "refresh" ? { refreshMode: hardRefresh ? "hard" as const : "normal" as const } : {}),
        ...(action === "sync" ? {
          options: {
            applyOnly,
            dryRun,
            force,
            prune,
            resources: selectedResources,
            revision: syncRevision.trim() || undefined,
            syncOptions: syncOptions.split(",").map((value) => value.trim()).filter(Boolean),
          },
        } : {}),
      });
      onAccepted(receipt);
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => { if (!open && !pending) onClose(); }} open={action !== null}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{action ? actionLabel(action, t) : t("workflows.resource.action")}</DialogTitle>
            <DialogDescription>
              {t("workflows.resource.confirm")}
              {action === "sync" ? ` · ${t("workflows.resource.nodeCount", { count: selectedResources.length })}` : null}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {failed ? <Alert variant="destructive"><AlertDescription>{t("workflows.resource.actionFailed")}</AlertDescription></Alert> : null}
            <Label className="grid gap-1.5">
              <span>{t("workflows.resource.reason")}</span>
              <Input autoFocus onChange={(event) => setReason(event.target.value)} required value={reason} />
            </Label>
            {action === "sync" ? (
              <>
                <Label className="grid gap-1.5">
                  <span>{t("workflows.sync.table.revision")}</span>
                  <Input onChange={(event) => setSyncRevision(event.target.value)} value={syncRevision} />
                </Label>
                <Label className="grid gap-1.5">
                  <span>{t("workflows.resource.syncOptions")}</span>
                  <Input onChange={(event) => setSyncOptions(event.target.value)} value={syncOptions} />
                </Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Toggle checked={prune} label={t("workflows.resource.prune")} onChange={setPrune} />
                  <Toggle checked={dryRun} label={t("workflows.resource.dryRun")} onChange={setDryRun} />
                  <Toggle checked={force} label={t("workflows.resource.force")} onChange={setForce} />
                  <Toggle checked={applyOnly} label={t("workflows.resource.applyOnly")} onChange={setApplyOnly} />
                </div>
              </>
            ) : null}
            {action === "refresh" ? (
              <Toggle checked={hardRefresh} label={t("workflows.resource.hardRefresh")} onChange={setHardRefresh} />
            ) : null}
          </div>
          <DialogFooter>
            <Button disabled={pending} onClick={onClose} type="button" variant="outline">{t("common.action.cancel")}</Button>
            <Button disabled={pending || !reason.trim()} type="submit">{t("common.action.confirm")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <Label className="flex min-h-9 items-center gap-2 rounded-md border border-border-subtle px-2.5 text-label-2">
      <input checked={checked} className="size-4 accent-primary" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span>{label}</span>
    </Label>
  );
}

export function gitOpsActionLabel(action: GitOpsResourceAction, t: ReturnType<typeof useI18n>["t"]): string {
  return actionLabel(action, t);
}

function actionLabel(action: GitOpsResourceAction, t: ReturnType<typeof useI18n>["t"]): string {
  switch (action) {
    case "reconcile": return t("workflows.resource.action.reconcile");
    case "sync_with_source": return t("workflows.resource.action.sync_with_source");
    case "suspend": return t("workflows.resource.action.suspend");
    case "resume": return t("workflows.resource.action.resume");
    case "sync": return t("workflows.resource.action.sync");
    case "refresh": return t("workflows.resource.action.refresh");
  }
}
