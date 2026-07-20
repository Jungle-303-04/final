import { BellPlus, Pencil, Plus, RefreshCw, Send, Trash2, Webhook } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AlertChannel,
  AlertChannelInput,
  AlertChannelsPort,
} from "../../features/alerts/alertChannelsContract";
import { useI18n } from "../../shared/i18n";
import { Surface } from "../../shared/ui/Surface";
import { StatusPill } from "../../shared/ui/status";
import { Button } from "../../shared/ui/primitives/button";
import { ConfirmationDialog } from "../../shared/ui/primitives/confirmation-dialog";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import { Spinner } from "../../shared/ui/primitives/spinner";
import { AlertChannelEditorDialog } from "./AlertChannelEditorDialog";

export function AlertChannelsPanel({
  lastInAppDeliveryAt,
  port,
}: {
  lastInAppDeliveryAt: string | null;
  port: AlertChannelsPort;
}) {
  const { t } = useI18n();
  const [channels, setChannels] = useState<readonly AlertChannel[]>([]);
  const [failure, setFailure] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingOperation, setPendingOperation] = useState<"delete" | "save" | "test" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [draft, setDraft] = useState<AlertChannelInput | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AlertChannel | null>(null);
  const [verifiedUrl, setVerifiedUrl] = useState<string | null>(null);
  const editorOpenerRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setFailure(false);
    setLoading(true);
    try {
      setChannels(await port.list(signal));
    } catch (error) {
      if (isAbortError(error)) return;
      setFailure(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [port]);

  useEffect(() => {
    const controller = new AbortController();
    void port.list(controller.signal).then((result) => {
      setChannels(result);
      setFailure(false);
      setLoading(false);
    }).catch((error: unknown) => {
      if (isAbortError(error)) return;
      setFailure(true);
      setLoading(false);
    });
    return () => controller.abort();
  }, [port]);

  const test = async (channel: AlertChannel) => {
    if (pendingId !== null) return;
    setPendingId(channel.id);
    setPendingOperation("test");
    setFeedback(null);
    try {
      const result = await port.test(channel);
      setFeedback(result.delivered
        ? t("alerts.channels.test.succeeded", { name: channel.name })
        : t("alerts.channels.test.failed", { name: channel.name }));
      await load();
    } catch {
      setFeedback(t("alerts.channels.test.failed", { name: channel.name }));
    } finally {
      setPendingId(null);
      setPendingOperation(null);
    }
  };

  const beginCreate = () => {
    editorOpenerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setVerifiedUrl(null);
    setDraft({ enabled: false, id: null, kind: "webhook", minimumSeverity: "warning", name: "", url: "" });
  };
  const beginEdit = (channel: AlertChannel) => {
    editorOpenerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setVerifiedUrl(channel.lastTestStatus?.toLowerCase() === "passed" ? channel.url : null);
    setDraft({ enabled: channel.enabled, id: channel.id, kind: "webhook", minimumSeverity: channel.minimumSeverity, name: channel.name, url: channel.url });
  };
  const closeEditor = () => {
    const opener = editorOpenerRef.current;
    setDraft(null);
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
    });
  };
  const save = async () => {
    if (!draft || pendingId !== null) return;
    setPendingId(draft.id ?? "create");
    setPendingOperation("save");
    setFeedback(null);
    try {
      const saved = await port.save(draft);
      setChannels((current) => draft.id === null ? [saved, ...current] : current.map((channel) => channel.id === saved.id ? saved : channel));
      setFeedback(t(draft.id === null ? "alerts.channels.created" : "alerts.channels.saved"));
      closeEditor();
    } catch { setFeedback(t("alerts.channels.saveFailure")); } finally { setPendingId(null); setPendingOperation(null); }
  };
  const remove = async () => {
    if (!deleteTarget || pendingId !== null) return;
    setPendingId(deleteTarget.id);
    setPendingOperation("delete");
    setFeedback(null);
    try {
      await port.remove(deleteTarget.id);
      setChannels((current) => current.filter(({ id }) => id !== deleteTarget.id));
      setFeedback(t("alerts.channels.deleted"));
      setDeleteTarget(null);
    } catch { setFeedback(t("alerts.channels.deleteFailure")); } finally { setPendingId(null); setPendingOperation(null); }
  };

  return (
    <section aria-labelledby="alert-channels-title" className="grid min-w-0 gap-4">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-title-3 font-semibold" id="alert-channels-title">
            {t("alerts.channels.title")}
          </h2>
          <p className="mt-1 text-body text-muted-foreground">
            {t("alerts.channels.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button aria-label={t("alerts.channels.refresh")} disabled={loading || pendingId !== null} onClick={() => void load()} size="widget-icon" type="button" variant="ghost"><RefreshCw aria-hidden="true" className={loading ? "motion-safe:animate-spin" : undefined} /></Button>
          <Button disabled={pendingId !== null} onClick={beginCreate} size="page-action" type="button"><Plus aria-hidden="true" />{t("alerts.channels.create")}</Button>
        </div>
      </header>
      <p aria-live="polite" className="min-h-5 text-body text-muted-foreground">
        {feedback ?? (failure && channels.length > 0 ? t("alerts.channels.stale") : "")}
      </p>
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <InAppChannelRow lastDeliveryAt={lastInAppDeliveryAt} />
        {loading && channels.length === 0 ? (
          <Skeleton aria-label={t("alerts.channels.refresh")} className="h-44 rounded-card" />
        ) : failure && channels.length === 0 ? (
          <ChannelFailure onRetry={() => void load()} />
        ) : channels.length === 0 ? (
          <ChannelEmpty onCreate={beginCreate} />
        ) : (
          channels.map((channel) => (
            <ChannelDeliveryRow
              channel={channel}
              key={channel.id}
              onDelete={() => setDeleteTarget(channel)}
              onEdit={() => beginEdit(channel)}
              onTest={() => void test(channel)}
              pending={pendingId === channel.id && pendingOperation === "test"}
            />
          ))
        )}
      </div>
      <AlertChannelEditorDialog canEnable={draft !== null && draft.url === verifiedUrl} draft={draft} onChange={setDraft} onClose={closeEditor} onSave={() => void save()} pending={pendingOperation === "save"} />
      <ConfirmationDialog cancelLabel={t("alerts.rules.cancel")} confirmLabel={t("alerts.channels.delete")} description={t("alerts.channels.deleteDescription")} onConfirm={() => void remove()} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} open={deleteTarget !== null} pending={pendingOperation === "delete"} title={t("alerts.channels.deleteTitle")} />
    </section>
  );
}

function InAppChannelRow({ lastDeliveryAt }: { lastDeliveryAt: string | null }) {
  const { formatDate, t } = useI18n();
  return (
    <Surface aria-label={t("alerts.channels.inApp.name")} className="grid min-w-0 gap-4 rounded-card p-4">
      <header className="flex min-w-0 items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-tint-primary-bg text-tint-primary-fg"><BellPlus aria-hidden="true" className="size-4" /></span>
        <div className="min-w-0 flex-1"><h3 className="text-body-strong font-semibold">{t("alerts.channels.inApp.name")}</h3><p className="mt-0.5 text-label text-caption-foreground">{t("alerts.channels.inApp.description")}</p></div>
        <StatusPill label={t("alerts.channels.inApp.active")} tone="healthy" />
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-label">
        <ChannelFact label={t("alerts.channels.kind")} value={t("alerts.channels.inApp.kind")} />
        <ChannelFact label={t("alerts.channels.minimumSeverity")} value={t("alerts.channels.inApp.allEvents")} />
        <ChannelFact label={t("alerts.channels.inApp.lastDelivery")} value={lastDeliveryAt ? formatDate(new Date(lastDeliveryAt), { dateStyle: "short", timeStyle: "short" }) : t("alerts.channels.inApp.noneYet")} />
      </dl>
    </Surface>
  );
}

function ChannelDeliveryRow({ channel, onDelete, onEdit, onTest, pending }: {
  channel: AlertChannel;
  onDelete(): void;
  onEdit(): void;
  onTest(): void;
  pending: boolean;
}) {
  const { formatDate, t } = useI18n();
  const passed = channel.lastTestStatus?.toLowerCase() === "passed";
  const tone = !channel.enabled ? "unknown" : passed ? "healthy" : "warning";
  const status = !channel.enabled
    ? t("alerts.channels.disabled")
    : passed
      ? t("alerts.channels.verified")
      : t("alerts.channels.unverified");
  return (
    <Surface aria-label={channel.name} className="grid min-w-0 gap-4 rounded-card p-4">
      <header className="flex min-w-0 items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Webhook aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-body-strong font-semibold" title={channel.name}>{channel.name}</h3>
          <p className="mt-0.5 truncate font-mono text-label text-caption-foreground" title={maskedTarget(channel.url)}>
            {maskedTarget(channel.url)}
          </p>
        </div>
        <StatusPill label={status} tone={tone} />
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-label">
        <ChannelFact label={t("alerts.channels.kind")} value={channel.kind} />
        <ChannelFact label={t("alerts.channels.minimumSeverity")} value={t(`alerts.severity.${channel.minimumSeverity}`)} />
        <ChannelFact
          label={t("alerts.channels.lastTest")}
          value={channel.lastTestedAt
            ? formatDate(new Date(channel.lastTestedAt), { dateStyle: "short", timeStyle: "short" })
            : t("alerts.channels.neverTested")}
        />
        <ChannelFact
          label={t("alerts.channels.response")}
          value={channel.lastTestStatusCode === null ? "—" : String(channel.lastTestStatusCode)}
        />
      </dl>
      {channel.lastTestDetail ? (
        <p className="truncate text-label text-muted-foreground" title={channel.lastTestDetail}>
          {channel.lastTestDetail}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button disabled={pending} onClick={onTest} size="compact-segment" type="button" variant="outline">{pending ? <Spinner decorative /> : <Send aria-hidden="true" />}{pending ? t("alerts.channels.testing") : t("alerts.channels.test")}</Button>
        <Button disabled={pending} onClick={onEdit} size="widget-icon" type="button" variant="ghost"><Pencil aria-hidden="true" /><span className="sr-only">{t("alerts.channels.edit")}</span></Button>
        <Button disabled={pending} onClick={onDelete} size="widget-icon" type="button" variant="ghost"><Trash2 aria-hidden="true" /><span className="sr-only">{t("alerts.channels.delete")}</span></Button>
      </div>
    </Surface>
  );
}

function ChannelFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium" title={value}>{value}</dd>
    </div>
  );
}

function ChannelEmpty({ onCreate }: { onCreate(): void }) {
  const { t } = useI18n();
  return (
    <Surface aria-label={t("alerts.channels.empty.title")} className="grid min-h-52 place-items-center rounded-card p-8 text-center">
      <div className="grid max-w-md justify-items-center gap-2">
        <BellPlus aria-hidden="true" className="size-6 text-caption-foreground" />
        <p className="font-semibold">{t("alerts.channels.empty.title")}</p>
        <p className="text-body text-muted-foreground">{t("alerts.channels.empty.description")}</p>
        <Button onClick={onCreate} size="page-action"><Plus aria-hidden="true" />{t("alerts.channels.empty.action")}</Button>
      </div>
    </Surface>
  );
}

function ChannelFailure({ onRetry }: { onRetry(): void }) {
  const { t } = useI18n();
  return (
    <Surface aria-label={t("alerts.channels.failure")} className="grid min-h-52 place-items-center rounded-card p-8 text-center">
      <div className="grid justify-items-center gap-2">
        <p className="font-semibold text-destructive">{t("alerts.channels.failure")}</p>
        <Button onClick={onRetry} size="page-secondary" variant="outline"><RefreshCw aria-hidden="true" />{t("common.action.retry")}</Button>
      </div>
    </Surface>
  );
}

function maskedTarget(value: string): string {
  try {
    const url = new URL(value);
    return url.pathname === "/" ? url.origin : `${url.origin}/•••`;
  } catch {
    return "•••";
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
