import { GitPullRequestArrow, Play, RefreshCw, ShieldCheck } from "lucide-react";

import type {
  ResourceManifestApprovalReceipt,
  ResourceManifestPreview,
  ResourceManifestSource,
} from "../../features/resources/resourceManifestContract";
import { useI18n } from "../../shared/i18n";
import type { CommandReceipt } from "../../shared/parity/referenceParity";
import { UnifiedDiff } from "../../shared/ui/UnifiedDiff";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { DialogFooter } from "../../shared/ui/primitives/dialog";
import { Input } from "../../shared/ui/primitives/input";
import { Label } from "../../shared/ui/primitives/label";
import { Spinner } from "../../shared/ui/primitives/spinner";

export type ResourceManifestPhase =
  | "idle" | "loading" | "ready" | "previewing" | "approving" | "applying" | "failed";

export function ResourceManifestEditorContent({
  phase,
  source,
  applicationId,
  yaml,
  preview,
  reason,
  receipt,
  applyReceipt,
  failure,
  busy,
  operationStatus,
  operationPartial,
  operationFailed,
  operationStoreAvailable,
  onApplicationChange,
  onYamlChange,
  onReasonChange,
  onReload,
  onPreview,
  onApprove,
  onApplyNow,
}: {
  phase: ResourceManifestPhase;
  source: ResourceManifestSource | null;
  applicationId: string;
  yaml: string;
  preview: ResourceManifestPreview | null;
  reason: string;
  receipt: ResourceManifestApprovalReceipt | null;
  applyReceipt: CommandReceipt | null;
  failure: "stale" | "generic" | null;
  busy: boolean;
  operationStatus: string | null;
  operationPartial: boolean;
  operationFailed: boolean;
  operationStoreAvailable: boolean;
  onApplicationChange: (value: string) => void;
  onYamlChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onReload: () => void;
  onPreview: () => void;
  onApprove: () => void;
  onApplyNow: () => void;
}) {
  const { t } = useI18n();
  const available = source?.status === "available" && source.content !== null;

  return (
    <>
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
              onChange={(event) => onApplicationChange(event.currentTarget.value)}
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
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="min-h-[24rem] w-full resize-y rounded-lg border border-input bg-code p-4 font-mono text-xs leading-5 text-code-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  disabled={busy || receipt !== null || applyReceipt !== null}
                  id="resource-manifest-yaml"
                  onChange={(event) => onYamlChange(event.currentTarget.value)}
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
                    <UnifiedDiff aria-label={t("resources.manifest.diff")} diff={preview.diff} wrap />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("resources.manifest.diffEmpty")}</p>
                  )}
                </div>
              </section>
            </div>
            {preview?.errors.map((error) => (
              <Alert key={error} variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
            ))}
            {preview?.impact.length ? (
              <section aria-label={t("resources.manifest.impact")} className="grid gap-2">
                <span className="text-sm font-medium">{t("resources.manifest.impact")}</span>
                <div className="flex flex-wrap gap-2">
                  {preview.impact.map((item) => (
                    <Badge key={`${item.apiVersion}:${item.kind}:${item.namespace ?? ""}:${item.name}`} variant={item.selected ? "default" : "outline"}>
                      <span>{item.kind}/{item.name}</span>
                      {item.namespace ? <span>· {item.namespace}</span> : null}
                    </Badge>
                  ))}
                </div>
              </section>
            ) : null}
            {preview?.valid && preview.applyAvailability === "unavailable" ? (
              <Alert>
                <AlertTitle>{t("resources.manifest.applyUnavailable")}</AlertTitle>
                <AlertDescription>{preview.applyReasonCodes.join(", ")}</AlertDescription>
              </Alert>
            ) : null}
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
            {applyReceipt ? (
              <Alert variant={operationPartial || operationFailed ? "destructive" : "default"}>
                <ShieldCheck aria-hidden="true" />
                <AlertTitle>{t(
                  operationPartial
                    ? "resources.manifest.applyPartial"
                    : operationFailed
                      ? "resources.manifest.applyFailed"
                      : "resources.manifest.applyAccepted",
                )}</AlertTitle>
                <AlertDescription>
                  {operationStoreAvailable
                    ? t("resources.manifest.applyStatus", { status: operationStatus ?? applyReceipt.status })
                    : t("resources.manifest.applyStreamUnavailable")}
                </AlertDescription>
              </Alert>
            ) : null}
            {preview?.valid && !receipt && !applyReceipt ? (
              <div className="grid gap-2">
                <Label htmlFor="resource-manifest-reason">{t("resources.manifest.reason")}</Label>
                <Input
                  disabled={busy}
                  id="resource-manifest-reason"
                  maxLength={500}
                  onChange={(event) => onReasonChange(event.currentTarget.value)}
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
          <Button onClick={onReload} type="button" variant="outline">
            <RefreshCw aria-hidden="true" />
            {t("resources.manifest.reload")}
          </Button>
        ) : null}
        {available && !receipt && !applyReceipt ? (
          <Button aria-busy={phase === "previewing"} disabled={busy} onClick={onPreview} type="button" variant="outline">
            {phase === "previewing" ? <Spinner decorative /> : null}
            {t("resources.manifest.preview")}
          </Button>
        ) : null}
        {preview?.valid && !receipt && !applyReceipt ? (
          <Button aria-busy={phase === "approving"} disabled={busy || reason.trim().length < 3} onClick={onApprove} type="button">
            {phase === "approving" ? <Spinner decorative /> : <GitPullRequestArrow aria-hidden="true" />}
            {t("resources.manifest.approve")}
          </Button>
        ) : null}
        {preview?.valid && !receipt && !applyReceipt && preview.applyAvailability === "available" ? (
          <Button aria-busy={phase === "applying"} disabled={busy || reason.trim().length < 3} onClick={onApplyNow} type="button" variant="destructive">
            {phase === "applying" ? <Spinner decorative /> : <Play aria-hidden="true" />}
            {t("resources.manifest.applyNow")}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}
