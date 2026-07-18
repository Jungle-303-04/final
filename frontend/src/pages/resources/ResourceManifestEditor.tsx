import { GitPullRequestArrow } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  ResourceManifestPortFailure,
  type ResourceManifestApprovalReceipt,
  type ResourceManifestPort,
  type ResourceManifestPreview,
  type ResourceManifestSource,
} from "../../features/resources/resourceManifestContract";
import type { ResourceDetail } from "../../features/resources/resourcesContract";
import {
  useOptionalOperationStatusSnapshots,
  useOptionalOperationStatusStore,
} from "../../features/operations/OperationStatusStore";
import { useI18n } from "../../shared/i18n";
import type { CommandReceipt } from "../../shared/parity/referenceParity";
import { Button } from "../../shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../shared/ui/primitives/dialog";
import {
  ResourceManifestEditorContent,
  type ResourceManifestPhase,
} from "./ResourceManifestEditorContent";

export interface ResourceManifestEditorHandle {
  open: () => void;
}

export const ResourceManifestEditor = forwardRef<ResourceManifestEditorHandle, {
  detail: ResourceDetail;
  disabledReason?: string | null;
  inline?: boolean;
  port: ResourceManifestPort;
  onUnauthorized?: () => void;
}>(function ResourceManifestEditor({
  detail,
  disabledReason = null,
  inline = false,
  port,
  onUnauthorized,
}, ref) {
  const { t } = useI18n();
  const operationStore = useOptionalOperationStatusStore();
  const operationSnapshots = useOptionalOperationStatusSnapshots();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<ResourceManifestPhase>("idle");
  const [source, setSource] = useState<ResourceManifestSource | null>(null);
  const [applicationId, setApplicationId] = useState("");
  const [yaml, setYaml] = useState("");
  const [preview, setPreview] = useState<ResourceManifestPreview | null>(null);
  const [reason, setReason] = useState("");
  const [receipt, setReceipt] = useState<ResourceManifestApprovalReceipt | null>(null);
  const [applyReceipt, setApplyReceipt] = useState<CommandReceipt | null>(null);
  const [failure, setFailure] = useState<"stale" | "generic" | null>(null);
  const controller = useRef<AbortController | null>(null);
  const loadRef = useRef<(selectedApplicationId?: string | null) => Promise<void>>(
    async () => undefined,
  );

  useEffect(() => () => controller.current?.abort(), []);

  const load = async (selectedApplicationId?: string | null) => {
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setPhase("loading");
    setFailure(null);
    setPreview(null);
    setReceipt(null);
    setApplyReceipt(null);
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
  loadRef.current = load;

  useEffect(() => {
    if (!inline || disabledReason !== null) return;
    setReason("");
    void loadRef.current();
    return () => controller.current?.abort();
  }, [detail.resource.inventoryKey, disabledReason, inline]);

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

  const applyNow = async () => {
    const input = editInput(source, applicationId, yaml);
    if (!input || !preview?.valid || preview.applyAvailability !== "available" || reason.trim().length < 3) return;
    setPhase("applying");
    setFailure(null);
    try {
      const result = await port.applyNow(detail.resource.inventoryKey, {
        ...input,
        desiredSha256: preview.desiredSha256,
        reason: reason.trim(),
      });
      setApplyReceipt(result);
      operationStore?.start(result.commandId);
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

  const openEditor = () => {
    if (disabledReason !== null) return;
    setOpen(true);
    setReason("");
    void load();
  };
  useImperativeHandle(ref, () => ({ open: openEditor }));

  const busy = ["loading", "previewing", "approving", "applying"].includes(phase);
  const operation = applyReceipt
    ? operationSnapshots.find((snapshot) => snapshot.commandId === applyReceipt.commandId) ?? null
    : null;
  const operationPartial = operation?.event?.payload.result !== null
    && typeof operation?.event?.payload.result === "object"
    && operation.event.payload.result !== undefined
    && "completeness" in operation.event.payload.result
    && operation.event.payload.result.completeness === "partial";
  const operationFailed = operation !== null && [
    "failed",
    "cancelled",
    "forbidden",
    "invalid",
    "unavailable",
  ].includes(operation.status);
  const editorContent = (
    <ResourceManifestEditorContent
      applicationId={applicationId}
      applyReceipt={applyReceipt}
      busy={busy}
      failure={failure}
      onApplicationChange={(value) => {
        setApplicationId(value);
        if (value) void load(value);
      }}
      onApplyNow={() => void applyNow()}
      onApprove={() => void approve()}
      onPreview={() => void previewEdit()}
      onReasonChange={setReason}
      onReload={() => void load(applicationId || null)}
      onYamlChange={(value) => {
        setYaml(value);
        setPreview(null);
        setReceipt(null);
        setApplyReceipt(null);
      }}
      operationFailed={operationFailed}
      operationPartial={operationPartial}
      operationStatus={operation?.status ?? null}
      operationStoreAvailable={operationStore !== null}
      phase={phase}
      preview={preview}
      reason={reason}
      receipt={receipt}
      source={source}
      yaml={yaml}
    />
  );
  if (inline) {
    return (
      <section
        aria-label={t("resources.manifest.title", { name: detail.identity.name })}
        className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 rounded-xl border bg-card p-4"
        data-slot="resource-manifest-inline"
      >
        <header className="grid gap-1">
          <h3 className="text-bodyStrong">
            {t("resources.manifest.title", { name: detail.identity.name })}
          </h3>
          <p className="text-body text-muted-foreground">
            {t("resources.manifest.description")}
          </p>
        </header>
        {editorContent}
      </section>
    );
  }
  return (
    <>
      <Button
        disabled={disabledReason !== null}
        onClick={openEditor}
        size="sm"
        title={disabledReason ?? undefined}
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
          {editorContent}
        </DialogContent>
      </Dialog>
    </>
  );
});

function editInput(source: ResourceManifestSource | null, applicationId: string, yaml: string) {
  if (!source?.baseSha || !source.sourceSha256 || !applicationId || !yaml) return null;
  return {
    applicationId,
    baseSha: source.baseSha,
    sourceSha256: source.sourceSha256,
    editedYaml: yaml,
  };
}
