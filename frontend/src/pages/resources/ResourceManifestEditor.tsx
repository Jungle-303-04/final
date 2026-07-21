import { GitPullRequestArrow, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  ResourceManifestPortFailure,
  type ResourceManifestApprovalReceipt,
  type ResourceManifestPort,
  type ResourceManifestPreview,
  type ResourceManifestSource,
} from "../../features/resources/resourceManifestContract";
import type { ResourceDetail } from "../../features/resources/resourcesContract";
import { useI18n } from "../../shared/i18n";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
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

type Phase = "idle" | "loading" | "ready" | "previewing" | "approving" | "failed";

export function ResourceManifestEditor({
  detail,
  port,
  onUnauthorized,
}: {
  detail: ResourceDetail;
  port: ResourceManifestPort;
  onUnauthorized?: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<ResourceManifestSource | null>(null);
  const [applicationId, setApplicationId] = useState("");
  const [yaml, setYaml] = useState("");
  const [preview, setPreview] = useState<ResourceManifestPreview | null>(null);
  const [reason, setReason] = useState("");
  const [receipt, setReceipt] = useState<ResourceManifestApprovalReceipt | null>(null);
  const [failure, setFailure] = useState<"stale" | "generic" | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const load = async (selectedApplicationId?: string | null) => {
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setPhase("loading");
    setFailure(null);
    setPreview(null);
    setReceipt(null);
    try {
      const next = await port.loadSource(
        detail.resource.inventoryKey,
        selectedApplicationId,
        nextController.signal,
      );
      if (nextController.signal.aborted) return;
      setSource(next);
      const selected = next.selected?.applicationId ?? selectedApplicationId ?? "";
      setApplicationId(selected);
      setYaml(next.content ?? "");
      setPhase("ready");
    } catch (error) {
      if (nextController.signal.aborted) return;
      handleFailure(error);
    }
  };

  const previewEdit = async () => {
    const input = editInput(source, applicationId, yaml);
    if (!input) return;
    setPhase("previewing");
    setFailure(null);
    try {
      const result = await port.preview(detail.resource.inventoryKey, input);
      setPreview(result);
      setPhase("ready");
    } catch (error) {
      handleFailure(error);
    }
  };

  const approve = async () => {
    const input = editInput(source, applicationId, yaml);
    if (!input || !preview?.valid || reason.trim().length < 3) return;
    setPhase("approving");
    setFailure(null);
    try {
      const result = await port.approve(detail.resource.inventoryKey, {
        ...input,
        reason: reason.trim(),
      });
      setReceipt(result);
      setPhase("ready");
    } catch (error) {
      handleFailure(error);
    }
  };

  function handleFailure(error: unknown) {
    if (error instanceof ResourceManifestPortFailure && error.code === "unauthorized") {
      onUnauthorized?.();
    }
    setFailure(
      error instanceof ResourceManifestPortFailure && error.code === "stale"
        ? "stale"
        : "generic",
    );
    setPhase("failed");
  }

  const busy = ["loading", "previewing", "approving"].includes(phase);
  const available = source?.status === "available" && source.content !== null;
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
          setReason("");
          void load();
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <GitPullRequestArrow aria-hidden="true" />
        {t("resources.manifest.open")}
      </Button>
      <Dialog
        onOpenChange={(next) => {
          if (!next && !busy) {
            controller.current?.abort();
            setOpen(false);
          }
        }}
        open={open}
      >
        <DialogContent className="grid max-h-[92svh] w-[min(96vw,80rem)] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{t("resources.manifest.title", { name: detail.identity.name })}</DialogTitle>
            <DialogDescription>{t("resources.manifest.description")}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto pr-1">
            {phase === "loading" ? (
              <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
                <Spinner className="size-4" decorative />
                {t("resources.manifest.loading")}
              </p>
            ) : source?.status === "ambiguous" ? (
              <section className="grid gap-3 py-4">
                <Label htmlFor="resource-manifest-application">{t("resources.manifest.application")}</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  id="resource-manifest-application"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setApplicationId(value);
                    if (value) void load(value);
                  }}
                  value={applicationId}
                >
                  <option value="">{t("resources.manifest.chooseApplication")}</option>
                  {source.choices.map((choice) => (
                    <option key={choice.applicationId} value={choice.applicationId}>
                      {choice.applicationName} · {choice.repositoryRef}/{choice.manifestPath}
                    </option>
                  ))}
                </select>
              </section>
            ) : source && !available ? (
              <Alert className="my-4" variant="destructive">
                <AlertTitle>{t("resources.manifest.unavailable")}</AlertTitle>
                <AlertDescription>{source.reason ?? t("resources.manifest.failed")}</AlertDescription>
              </Alert>
            ) : available && source?.selected ? (
              <div className="grid min-h-0 gap-4 py-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{source.selected.repositoryRef}</Badge>
                  <Badge variant="outline">{source.selected.branch}</Badge>
                  <span className="min-w-0 break-all">{source.selected.manifestPath}</span>
                  <span className="ml-auto font-mono">{source.baseSha?.slice(0, 12)}</span>
                </div>
                <div className="grid min-h-[28rem] gap-4 lg:grid-cols-2">
                  <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
                    <Label htmlFor="resource-manifest-yaml">{t("resources.manifest.yaml")}</Label>
                    <textarea
                      aria-label={t("resources.manifest.yaml")}
                      className="min-h-[24rem] w-full resize-y rounded-lg border border-input bg-[#0d1117] p-4 font-mono text-xs leading-5 text-[#e6edf3] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      disabled={busy || receipt !== null}
                      id="resource-manifest-yaml"
                      onChange={(event) => {
                        setYaml(event.currentTarget.value);
                        setPreview(null);
                        setReceipt(null);
                      }}
                      spellCheck={false}
                      value={yaml}
                    />
                  </section>
                  <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{t("resources.manifest.diff")}</span>
                      {preview ? (
                        <Badge variant={preview.valid ? "outline" : "destructive"}>
                          {preview.valid ? t("resources.manifest.valid") : t("resources.manifest.invalid")}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="min-h-[24rem] overflow-auto rounded-lg border bg-muted/25 p-4">
                      {preview?.diff ? (
                        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5">{preview.diff}</pre>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t("resources.manifest.diffEmpty")}</p>
                      )}
                    </div>
                  </section>
                </div>
                {preview?.errors.map((error) => (
                  <Alert key={error} variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
                ))}
                {failure ? (
                  <Alert variant="destructive">
                    <AlertTitle>{failure === "stale" ? t("resources.manifest.stale") : t("resources.manifest.failed")}</AlertTitle>
                    <AlertDescription>
                      {failure === "stale" ? t("resources.manifest.staleDescription") : t("resources.manifest.failedDescription")}
                    </AlertDescription>
                  </Alert>
                ) : null}
                {receipt ? (
                  <Alert>
                    <ShieldCheck aria-hidden="true" />
                    <AlertTitle>{t("resources.manifest.accepted")}</AlertTitle>
                    <AlertDescription>
                      {t("resources.manifest.acceptedDescription", { id: receipt.correlationId })}
                    </AlertDescription>
                  </Alert>
                ) : null}
                {preview?.valid && !receipt ? (
                  <div className="grid gap-2">
                    <Label htmlFor="resource-manifest-reason">{t("resources.manifest.reason")}</Label>
                    <Input
                      disabled={busy}
                      id="resource-manifest-reason"
                      maxLength={500}
                      onChange={(event) => setReason(event.currentTarget.value)}
                      placeholder={t("resources.manifest.reasonPlaceholder")}
                      value={reason}
                    />
                  </div>
                ) : null}
              </div>
            ) : phase === "failed" ? (
              <Alert className="my-4" variant="destructive">
                <AlertTitle>{t("resources.manifest.failed")}</AlertTitle>
                <AlertDescription>{t("resources.manifest.failedDescription")}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <DialogFooter>
            {failure === "stale" ? (
              <Button onClick={() => void load(applicationId || null)} type="button" variant="outline">
                <RefreshCw aria-hidden="true" />
                {t("resources.manifest.reload")}
              </Button>
            ) : null}
            {available && !receipt ? (
              <Button aria-busy={phase === "previewing"} disabled={busy} onClick={() => void previewEdit()} type="button" variant="outline">
                {phase === "previewing" ? <Spinner decorative /> : null}
                {t("resources.manifest.preview")}
              </Button>
            ) : null}
            {preview?.valid && !receipt ? (
              <Button aria-busy={phase === "approving"} disabled={busy || reason.trim().length < 3} onClick={() => void approve()} type="button">
                {phase === "approving" ? <Spinner decorative /> : <GitPullRequestArrow aria-hidden="true" />}
                {t("resources.manifest.approve")}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function editInput(source: ResourceManifestSource | null, applicationId: string, yaml: string) {
  if (!source?.baseSha || !source.sourceSha256 || !applicationId || !yaml) return null;
  return {
    applicationId,
    baseSha: source.baseSha,
    sourceSha256: source.sourceSha256,
    editedYaml: yaml,
  };
}
