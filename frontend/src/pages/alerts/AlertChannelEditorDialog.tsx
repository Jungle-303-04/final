import type { AlertChannelInput } from "../../features/alerts/alertChannelsContract";
import { useI18n } from "../../shared/i18n";
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
import { Spinner } from "../../shared/ui/primitives/spinner";

export function AlertChannelEditorDialog({
  canEnable,
  draft,
  onChange,
  onClose,
  onSave,
  pending,
}: {
  canEnable: boolean;
  draft: AlertChannelInput | null;
  onChange(next: AlertChannelInput): void;
  onClose(): void;
  onSave(): void;
  pending: boolean;
}) {
  const { t } = useI18n();
  if (!draft) return null;
  const editing = draft.id !== null;
  const update = (changes: Partial<AlertChannelInput>) => onChange({ ...draft, ...changes });
  const updateUrl = (url: string) => update({ enabled: false, url });
  return (
    <Dialog onOpenChange={(open) => { if (!open && !pending) onClose(); }} open>
      <DialogContent className="sm:max-w-lg" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{editing ? t("alerts.channels.edit") : t("alerts.channels.create")}</DialogTitle>
          <DialogDescription>{editing ? t("alerts.channels.editDescription") : t("alerts.channels.createDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Label className="grid gap-1.5"><span>{t("alerts.channels.name")}</span><Input autoFocus maxLength={120} onChange={(event) => update({ name: event.currentTarget.value })} value={draft.name} /></Label>
          <Label className="grid gap-1.5"><span>{t("alerts.channels.url")}</span><Input inputMode="url" maxLength={2000} onChange={(event) => updateUrl(event.currentTarget.value)} placeholder={t("alerts.channels.urlPlaceholder")} type="url" value={draft.url} /></Label>
          <Label className="grid gap-1.5"><span>{t("alerts.channels.minimumSeverity")}</span><select className="h-9 rounded-lg border bg-background px-3" onChange={(event) => update({ minimumSeverity: event.currentTarget.value as AlertChannelInput["minimumSeverity"] })} value={draft.minimumSeverity}>{(["info", "warning", "critical"] as const).map((severity) => <option key={severity} value={severity}>{t(`alerts.severity.${severity}`)}</option>)}</select></Label>
          <label className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3">
            <input checked={draft.enabled} className="mt-0.5 size-4 accent-primary" disabled={!canEnable && !draft.enabled} onChange={(event) => update({ enabled: event.currentTarget.checked })} type="checkbox" />
            <span className="grid gap-0.5"><span className="font-medium">{t("alerts.channels.enabled")}</span><span className="text-xs text-muted-foreground">{canEnable ? t("alerts.channels.enabledDescription") : t("alerts.channels.enableAfterTest")}</span></span>
          </label>
        </div>
        <DialogFooter>
          <Button disabled={pending} onClick={onClose} type="button" variant="outline">{t("alerts.rules.cancel")}</Button>
          <Button disabled={pending || !validDraft(draft)} onClick={onSave} type="button">{pending ? <Spinner /> : null}{pending ? t("alerts.channels.saving") : t("alerts.channels.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function validDraft(draft: AlertChannelInput): boolean {
  if (!draft.name.trim() || !draft.url.trim()) return false;
  try {
    const url = new URL(draft.url);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
