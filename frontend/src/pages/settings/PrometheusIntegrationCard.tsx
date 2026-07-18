import { Plus, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import { OperationStatusFeedback } from "../../features/operations/OperationStatusFeedback";
import { useOptionalOperationStatusStore } from "../../features/operations/OperationStatusStore";
import type { PrometheusIntegrationStatus, SettingsPort } from "../../features/settings/settingsContract";
import { useI18n } from "../../shared/i18n";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { Input } from "../../shared/ui/primitives/input";
import { Label } from "../../shared/ui/primitives/label";
import { Spinner } from "../../shared/ui/primitives/spinner";
import { hasUrlOriginChanged } from "./prometheusIntegrationForm";

type LoadState<T> = { phase: "idle" } | { phase: "loading" }
  | { phase: "ready"; data: T } | { phase: "failed"; error: unknown };

interface PrometheusHeaderRow { id: number; name: string; value: string }

export function PrometheusIntegrationCard({ settingsPort }: { settingsPort: SettingsPort }) {
  const scope = useClusterScope();
  const { t } = useI18n();
  const operationStore = useOptionalOperationStatusStore();
  const nextHeaderId = useRef(0);
  const request = useRef<AbortController | null>(null);
  const [load, setLoad] = useState<LoadState<PrometheusIntegrationStatus>>({ phase: "idle" });
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<PrometheusHeaderRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [receipt, setReceipt] = useState<PrometheusIntegrationStatus["receipt"]>(null);
  const [revision, setRevision] = useState(0);
  const clusterId = scope.selection.kind === "selected" ? scope.selection.cluster.id : null;

  const createHeader = (name = ""): PrometheusHeaderRow => ({
    id: ++nextHeaderId.current,
    name,
    value: "",
  });

  useEffect(() => {
    request.current?.abort();
    if (!clusterId) {
      let active = true;
      queueMicrotask(() => {
        if (!active) return;
        setReceipt(null);
        setSaveFailed(false);
        setLoad({ phase: "idle" });
        setUrl("");
        setHeaders([]);
      });
      return () => {
        active = false;
      };
    }
    const controller = new AbortController();
    request.current = controller;
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setReceipt(null);
      setSaveFailed(false);
      setLoad({ phase: "loading" });
    });
    void settingsPort.getPrometheusIntegration(clusterId, controller.signal).then(
      (status) => {
        if (controller.signal.aborted) return;
        setLoad({ phase: "ready", data: status });
        setUrl(status.url ?? "");
        setHeaders(status.headerNames.map((name) => createHeader(name)));
      },
      (error: unknown) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setLoad({ phase: "failed", error });
        }
      },
    );
    return () => controller.abort();
  }, [clusterId, revision, settingsPort]);

  useEffect(() => () => request.current?.abort(), []);

  const baselineHeaderNames = load.phase === "ready" ? load.data.headerNames : [];
  const sameHeaderStructure = canonicalHeaderNames(headers.map((header) => header.name))
    === canonicalHeaderNames(baselineHeaderNames);
  const hasHeaderValue = headers.some((header) => Boolean(header.value.trim()));
  const originChanged = baselineHeaderNames.length > 0
    && hasUrlOriginChanged(url, load.phase === "ready" ? load.data.url : null);
  const preservesHeaders = sameHeaderStructure && !hasHeaderValue && !originChanged;
  const explicitHeaderRemoval = baselineHeaderNames.length > 0 && headers.length === 0;
  const invalidHeader = headers.some((header) => !header.name.trim() || !header.value.trim());
  const duplicateHeader = new Set(
    headers.map((header) => header.name.trim().toLocaleLowerCase("en-US")),
  ).size !== headers.length;
  const canSave = load.phase === "ready"
    && !saving
    && Boolean(url.trim())
    && (preservesHeaders || explicitHeaderRemoval || (!invalidHeader && !duplicateHeader));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clusterId || !canSave) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSaving(true);
    setSaveFailed(false);
    try {
      const result = await settingsPort.updatePrometheusIntegration({
        clusterId,
        url: url.trim(),
        headers: preservesHeaders
          ? undefined
          : headers.map((header) => ({
              name: header.name.trim(),
              value: header.value,
            })),
      }, controller.signal);
      if (controller.signal.aborted) return;
      setLoad({ phase: "ready", data: result });
      setUrl(result.url ?? url.trim());
      setHeaders(result.headerNames.map((name) => createHeader(name)));
      setReceipt(result.receipt);
      if (result.receipt) operationStore?.start(result.receipt.commandId);
    } catch (error) {
      if (!controller.signal.aborted && !isAbortError(error)) setSaveFailed(true);
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  };

  const status = load.phase === "ready" ? load.data : null;
  return (
    <Card className="min-w-0 lg:col-span-2">
      <CardHeader className="grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3">
        <span className="row-span-2 grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Settings2 aria-hidden="true" className="size-4" />
        </span>
        <CardTitle><h3>{t("settings.integrations.prometheus.title")}</h3></CardTitle>
        {status ? (
          <Badge className="col-start-3 row-span-2 row-start-1" variant="outline">
            {t(`settings.integrations.prometheus.state.${status.state}`)}
          </Badge>
        ) : null}
        <CardDescription className="col-start-2">
          {t("settings.integrations.prometheus.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!clusterId ? (
          <p className="text-sm text-muted-foreground">
            {t("settings.integrations.prometheus.clusterRequired")}
          </p>
        ) : load.phase === "loading" || load.phase === "idle" ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            {t("settings.integrations.prometheus.loading")}
          </div>
        ) : load.phase === "failed" ? (
          <div className="grid gap-3">
            <Alert variant="destructive">
              <AlertDescription>{t("settings.integrations.prometheus.loadFailed")}</AlertDescription>
            </Alert>
            <Button className="w-fit" onClick={() => setRevision((value) => value + 1)} variant="outline">
              <RefreshCw aria-hidden="true" />
              {t("common.action.retry")}
            </Button>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={(event) => void save(event)}>
            <div className="grid gap-2">
              <Label htmlFor="prometheus-integration-url">
                {t("settings.integrations.prometheus.url")}
              </Label>
              <Input
                autoComplete="url"
                id="prometheus-integration-url"
                onChange={(event) => setUrl(event.currentTarget.value)}
                placeholder={t("settings.integrations.prometheus.urlPlaceholder")}
                type="url"
                value={url}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{t("settings.integrations.prometheus.headers")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.integrations.prometheus.secretHint")}
                  </p>
                </div>
                <Button
                  onClick={() => setHeaders((current) => [...current, createHeader()])}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Plus aria-hidden="true" />
                  {t("settings.integrations.prometheus.addHeader")}
                </Button>
              </div>
              {headers.length === 0 ? (
                <p className="border-y py-3 text-xs text-muted-foreground">
                  {t("settings.integrations.prometheus.noHeaders")}
                </p>
              ) : (
                <div className="grid gap-2">
                  {headers.map((header) => (
                    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]" key={header.id}>
                      <Input
                        aria-label={t("settings.integrations.prometheus.headerName")}
                        autoComplete="off"
                        onChange={(event) => {
                          const name = event.currentTarget.value;
                          setHeaders((current) => current.map((candidate) => (
                            candidate.id === header.id ? { ...candidate, name } : candidate
                          )));
                        }}
                        placeholder={t("settings.integrations.prometheus.headerName")}
                        value={header.name}
                      />
                      <Input
                        aria-label={header.name.trim()
                          ? t("settings.integrations.prometheus.headerValueFor", { name: header.name.trim() })
                          : t("settings.integrations.prometheus.headerValue")}
                        autoComplete="new-password"
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setHeaders((current) => current.map((candidate) => (
                            candidate.id === header.id ? { ...candidate, value } : candidate
                          )));
                        }}
                        placeholder={t("settings.integrations.prometheus.headerValue")}
                        type="password"
                        value={header.value}
                      />
                      <Button
                        aria-label={t("settings.integrations.prometheus.removeHeader", {
                          name: header.name.trim() || t("settings.integrations.prometheus.headerName"),
                        })}
                        onClick={() => setHeaders((current) => current.filter((candidate) => candidate.id !== header.id))}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {duplicateHeader ? (
              <p className="text-xs text-destructive">
                {t("settings.integrations.prometheus.duplicateHeader")}
              </p>
            ) : null}
            {originChanged && invalidHeader ? (
              <p className="text-xs text-destructive">
                {t("settings.integrations.prometheus.originChanged")}
              </p>
            ) : null}
            {saveFailed ? (
              <Alert variant="destructive">
                <AlertDescription>{t("settings.integrations.prometheus.saveFailed")}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <Button disabled={!canSave} type="submit">
                {saving ? <Spinner /> : null}
                {t("settings.integrations.prometheus.save")}
              </Button>
              {receipt && operationStore ? (
                <OperationStatusFeedback
                  commandId={receipt.commandId}
                  correlationId={receipt.correlationId}
                />
              ) : null}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function canonicalHeaderNames(names: readonly string[]): string {
  return names
    .map((name) => name.trim().toLocaleLowerCase("en-US"))
    .sort()
    .join("\n");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
