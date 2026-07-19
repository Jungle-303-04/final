import { Download, File, Folder, HardDrive } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import type {
  ResourceFileCapabilityId,
  ResourceFileCommandInput,
  ResourceFileDirectoryResult,
  ResourceFileEntry,
  ResourceFilesPort,
  ResourceImageMetadataResult,
} from "../../features/resource-files/resourceFilesContract";
import type { ResourceDetail } from "../../features/resources/resourcesContract";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../shared/ui/primitives/dialog";
import { Input } from "../../shared/ui/primitives/input";
import type { ResourceCapabilitiesFrame } from "./useResourceCapabilitiesDataFrame";

type BrowserMode = "image" | "pod";

export function ResourceFilesystemBrowser({
  capabilities,
  detail,
  port,
}: {
  capabilities: ResourceCapabilitiesFrame;
  detail: ResourceDetail;
  port: ResourceFilesPort;
}) {
  const { t } = useI18n();
  const available = useMemo(() => {
    if (capabilities.phase !== "ready") return new Map<ResourceFileCapabilityId, string>();
    return new Map(capabilities.data.capabilities
      .filter((item) => item.execution === "resource-files")
      .map((item) => [item.capabilityId as ResourceFileCapabilityId, item.label]));
  }, [capabilities]);
  const containers = detail.resource.facts.type === "pod"
    ? detail.resource.facts.containerNames ?? []
    : [];
  const [container, setContainer] = useState(containers[0] ?? "");
  const [mode, setMode] = useState<BrowserMode | null>(null);
  const [directory, setDirectory] = useState<ResourceFileDirectoryResult | null>(null);
  const [metadata, setMetadata] = useState<ResourceImageMetadataResult | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputFor = useCallback((nextMode: BrowserMode): Omit<ResourceFileCommandInput, "operation"> | null => {
    if (capabilities.phase !== "ready" || !detail.resource.uid || !container) return null;
    const slash = detail.resource.apiVersion.indexOf("/");
    return {
      capabilityId: `${nextMode}.filesystem`,
      capabilityRevision: capabilities.data.revision,
      resourceId: capabilities.data.subject.resourceId,
      snapshotId: capabilities.data.subject.snapshotId,
      resource: {
        apiGroup: slash === -1 ? "" : detail.resource.apiVersion.slice(0, slash),
        version: slash === -1 ? detail.resource.apiVersion : detail.resource.apiVersion.slice(slash + 1),
        kind: detail.resource.kind,
        namespace: detail.resource.namespace,
        name: detail.resource.name,
        uid: detail.resource.uid,
      },
      container,
    };
  }, [capabilities, container, detail]);

  const loadDirectory = useCallback(async (
    nextMode: BrowserMode,
    path: string,
    artifactId: string | null = metadata?.artifactId ?? null,
  ) => {
    const base = inputFor(nextMode);
    if (!base) return;
    setLoading(true);
    setError(null);
    try {
      const result = await port.run({
        ...base,
        operation: `${nextMode}.list`,
        path,
        cursor: 0,
        limit: 100,
        artifactId: nextMode === "image" ? artifactId : null,
      });
      if (
        typeof result !== "object" ||
        result === null ||
        !("entries" in result) ||
        result.operation !== `${nextMode}.list`
      ) {
        throw new Error("incompatible filesystem result");
      }
      setDirectory(result);
      setLocation(nextMode, result.path);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [inputFor, metadata?.artifactId, port]);

  const open = useCallback(async (nextMode: BrowserMode) => {
    const base = inputFor(nextMode);
    if (!base) return;
    setMode(nextMode);
    setFilter("");
    setError(null);
    setDirectory(null);
    setMetadata(null);
    setLocation(nextMode, "/");
    if (nextMode === "pod") {
      await loadDirectory("pod", "/", null);
      return;
    }
    setLoading(true);
    try {
      const result = await port.run({ ...base, operation: "image.metadata" });
      if (
        typeof result !== "object" ||
        result === null ||
        result.operation !== "image.metadata"
      ) {
        throw new Error("incompatible image metadata result");
      }
      setMetadata(result);
      if (result.cached && result.artifactId) await loadDirectory("image", "/", result.artifactId);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [inputFor, loadDirectory, port]);

  const close = useCallback(() => {
    setMode(null);
    clearLocation();
  }, []);

  const download = useCallback(async (entry: ResourceFileEntry) => {
    if (!mode) return;
    const base = inputFor(mode);
    if (!base) return;
    setError(null);
    try {
      const blob = await port.download({
        ...base,
        operation: `${mode}.read`,
        artifactId: mode === "image" ? metadata?.artifactId : null,
        path: entry.path,
        offset: 0,
      });
      saveBlob(blob, entry.name);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [inputFor, metadata, mode, port]);

  if (detail.resource.facts.type !== "pod" || !detail.resource.uid || containers.length === 0) {
    return null;
  }
  const entries = directory?.entries.filter((entry) => entry.name.toLocaleLowerCase()
    .includes(filter.trim().toLocaleLowerCase())) ?? [];

  return (
    <>
      {available.has("image.filesystem") ? (
        <Button onClick={() => void open("image")} size="sm" type="button" variant="outline">
          <HardDrive aria-hidden="true" />{t("resources.files.image")}
        </Button>
      ) : null}
      {available.has("pod.filesystem") ? (
        <Button onClick={() => void open("pod")} size="sm" type="button" variant="outline">
          <Folder aria-hidden="true" />{t("resources.files.pod")}
        </Button>
      ) : null}
      <Dialog onOpenChange={(isOpen) => { if (!isOpen) close(); }} open={mode !== null}>
        <DialogContent className="h-[min(46rem,calc(100dvh-2rem))] max-w-[min(64rem,calc(100vw-2rem))] grid-rows-[auto_auto_auto_minmax(0,1fr)] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{mode ? `${t(`resources.files.${mode}`)} · ${detail.resource.name}` : ""}</DialogTitle>
            <DialogDescription>{directory?.path ?? "/"}</DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {available.has("image.filesystem") && mode !== "image" ? (
              <Button onClick={() => void open("image")} size="sm" type="button" variant="outline">{t("resources.files.image")}</Button>
            ) : null}
            {available.has("pod.filesystem") && mode !== "pod" ? (
              <Button onClick={() => void open("pod")} size="sm" type="button" variant="outline">{t("resources.files.pod")}</Button>
            ) : null}
            {containers.length > 1 ? (
              <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                {t("resources.files.container")}
                <select
                  className="h-8 rounded-lg border bg-background px-2 text-foreground"
                  onChange={(event) => setContainer(event.currentTarget.value)}
                  value={container}
                >
                  {containers.map((name) => <option key={name}>{name}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          <div className="grid min-w-0 gap-2">
            <Breadcrumb path={directory?.path ?? "/"} onOpen={(path) => mode && void loadDirectory(mode, path)} rootLabel={t("resources.files.root")} />
            <Input
              aria-label={t("resources.files.filter")}
              onChange={(event) => setFilter(event.currentTarget.value)}
              placeholder={t("resources.files.filter")}
              role="searchbox"
              value={filter}
            />
          </div>
          <div className="min-h-0 overflow-y-auto rounded-lg border">
            {error ? <p className="border-b bg-destructive/10 px-3 py-2 text-destructive" role="alert">{error}</p> : null}
            {mode === "image" && metadata && !directory && !metadata.cached ? (
              <div className="grid gap-3 p-4">
                <p>{t("resources.files.imageConsent")}</p>
                <Button onClick={() => void loadDirectory("image", "/", metadata.artifactId)} type="button">
                  {t("resources.files.loadImage")}
                </Button>
              </div>
            ) : null}
            {loading ? <p aria-live="polite" className="p-4 text-muted-foreground">{t("resources.files.loading")}</p> : null}
            {!loading && directory && entries.length === 0 ? <p className="p-4 text-muted-foreground">{t("resources.files.empty")}</p> : null}
            {directory ? (
              <ul className="divide-y">
                {entries.map((entry) => (
                  <li className="flex min-w-0 items-center gap-2 px-3 py-2" key={entry.path}>
                    {entry.type === "directory" ? <Folder aria-hidden="true" className="size-4 shrink-0" /> : <File aria-hidden="true" className="size-4 shrink-0" />}
                    {entry.type === "directory" ? (
                      <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => mode && void loadDirectory(mode, entry.path)} type="button">{entry.name}</button>
                    ) : <span className="min-w-0 flex-1 truncate">{entry.name}</span>}
                    {entry.type === "file" ? (
                      <Button aria-label={t("resources.files.download", { name: entry.name })} onClick={() => void download(entry)} size="icon-sm" type="button" variant="ghost"><Download aria-hidden="true" /></Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Breadcrumb({ path, rootLabel, onOpen }: { path: string; rootLabel: string; onOpen: (path: string) => void }) {
  const parts = path.split("/").filter(Boolean);
  return (
    <nav aria-label={path} className="flex min-w-0 items-center gap-1 overflow-x-auto text-xs">
      <button className="shrink-0 hover:underline" onClick={() => onOpen("/")} type="button">{rootLabel}</button>
      {parts.map((part, index) => {
        const next = `/${parts.slice(0, index + 1).join("/")}`;
        return <span className="flex items-center gap-1" key={next}><span aria-hidden="true">/</span><button className="max-w-48 truncate hover:underline" onClick={() => onOpen(next)} type="button">{part}</button></span>;
      })}
    </nav>
  );
}

function setLocation(mode: BrowserMode, path: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("files", mode);
  url.searchParams.set("filePath", path);
  window.history.replaceState(window.history.state, "", url);
}

function clearLocation() {
  const url = new URL(window.location.href);
  url.searchParams.delete("files");
  url.searchParams.delete("filePath");
  window.history.replaceState(window.history.state, "", url);
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}
