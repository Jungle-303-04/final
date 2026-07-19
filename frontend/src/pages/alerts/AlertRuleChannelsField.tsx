import { RefreshCw } from "lucide-react";
import { useEffect, useId, useState } from "react";

import type { AlertChannel, AlertChannelsPort } from "../../features/alerts/alertChannelsContract";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { Spinner } from "../../shared/ui/primitives/spinner";

interface AlertRuleChannelsFieldProps {
  onChange(channels: string[]): void;
  port: AlertChannelsPort;
  selected: readonly string[];
}

export function AlertRuleChannelsField({
  onChange,
  port,
  selected,
}: AlertRuleChannelsFieldProps) {
  const { t } = useI18n();
  const titleId = useId();
  const [channels, setChannels] = useState<readonly AlertChannel[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void port.list(controller.signal).then((result) => {
      setChannels(result);
      setFailed(false);
      setLoading(false);
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFailed(true);
      setLoading(false);
    });
    return () => controller.abort();
  }, [port, revision]);

  const retry = () => {
    setFailed(false);
    setLoading(true);
    setRevision((value) => value + 1);
  };

  const selectedSet = new Set(selected);
  const availableIds = new Set(channels.map(({ id }) => id));
  const missingIds = selected.filter((id) => !availableIds.has(id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <fieldset aria-busy={loading} className="min-w-0 rounded-lg border p-3 sm:col-span-2">
      <legend className="px-1 text-sm font-medium" id={titleId}>{t("alerts.rules.channels")}</legend>
      <p className="mb-2 text-xs text-muted-foreground">{t("alerts.rules.channelsDescription")}</p>
      {loading ? (
        <div className="flex min-h-12 items-center justify-center gap-2 text-xs text-muted-foreground"><Spinner />{t("alerts.channels.refresh")}</div>
      ) : failed ? (
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-md bg-status-warning/10 px-3 text-xs text-status-warning" role="status">
          <span>{t("alerts.rules.channelsFailure")}</span>
          <Button aria-label={t("alerts.channels.refresh")} onClick={retry} size="icon" type="button" variant="ghost"><RefreshCw aria-hidden="true" /></Button>
        </div>
      ) : channels.length === 0 && missingIds.length === 0 ? (
        <p className="rounded-md bg-muted/35 px-3 py-2 text-xs text-muted-foreground">{t("alerts.rules.channelsEmpty")}</p>
      ) : (
        <div aria-labelledby={titleId} className="grid max-h-36 gap-1 overflow-y-auto" role="group">
          {channels.map((channel) => {
            const checked = selectedSet.has(channel.id);
            return (
              <label className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50" key={channel.id}>
                <input checked={checked} className="size-4 shrink-0 accent-primary" disabled={!channel.enabled && !checked} onChange={() => toggle(channel.id)} type="checkbox" />
                <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{channel.enabled ? channel.kind : t("alerts.rules.channelPaused")}</span>
              </label>
            );
          })}
          {missingIds.map((id) => (
            <label className="flex min-w-0 items-center gap-2 rounded-md bg-status-warning/10 px-2 py-1.5 text-sm" key={id}>
              <input checked className="size-4 shrink-0 accent-primary" onChange={() => toggle(id)} type="checkbox" />
              <span className="min-w-0 flex-1 truncate">{id}</span>
              <span className="shrink-0 text-xs text-status-warning">{t("alerts.rules.channelUnavailable")}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
