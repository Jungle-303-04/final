import { Plus, Settings2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  ChecksPortFailure,
  type ChecksCatalogEntry,
  type ChecksPort,
  type ChecksSettings,
  type ChecksSettingsPolicy,
} from "../../features/checks/checksContract";
import {
  isKubernetesNamespace,
  isStableFilterValue,
} from "../../features/filters/filterUrlSyntax";
import { useI18n } from "../../shared/i18n";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
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

interface ChecksSettingsDialogProps {
  catalog: readonly ChecksCatalogEntry[];
  onOpenChange(open: boolean): void;
  onSaved(): void;
  open: boolean;
  port: ChecksPort;
}

type SettingsFrame =
  | { phase: "loading" }
  | { phase: "failed"; conflict: boolean }
  | { phase: "ready"; settings: ChecksSettings; draft: ChecksSettingsPolicy };

export function ChecksSettingsDialog({
  catalog,
  onOpenChange,
  onSaved,
  open,
  port,
}: ChecksSettingsDialogProps) {
  const { t } = useI18n();
  const [frame, setFrame] = useState<SettingsFrame>({ phase: "loading" });
  const [namespaceInput, setNamespaceInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (signal?: AbortSignal, conflict = false) => {
    setFrame({ phase: "loading" });
    try {
      const settings = await port.getSettings(signal);
      setFrame({ phase: "ready", settings, draft: settings.policy });
    } catch (error) {
      if (isAbortError(error)) return;
      setFrame({ phase: "failed", conflict });
    }
  }, [port]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void port.getSettings(controller.signal).then((settings) => {
      setFrame({ phase: "ready", settings, draft: settings.policy });
    }).catch((error: unknown) => {
      if (!isAbortError(error)) setFrame({ phase: "failed", conflict: false });
    });
    return () => controller.abort();
  }, [open, port]);

  const close = () => {
    setNamespaceInput("");
    setSaving(false);
    onOpenChange(false);
  };

  const save = async () => {
    if (frame.phase !== "ready" || !frame.settings.canEdit || saving) return;
    const pendingNamespace = namespaceInput.trim();
    const policy = pendingNamespace
      ? {
          ...frame.draft,
          hiddenNamespaces: sortedUnique([...frame.draft.hiddenNamespaces, pendingNamespace]),
        }
      : frame.draft;
    setSaving(true);
    try {
      await port.updateSettings(policy, frame.settings.revision);
      onSaved();
      close();
    } catch (error) {
      if (error instanceof ChecksPortFailure && error.code === "conflict") {
        await load(undefined, true);
      } else {
        setFrame({ phase: "failed", conflict: false });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={(next) => !saving && (next ? onOpenChange(true) : close())} open={open}>
      <DialogContent className="grid max-h-[88svh] w-[min(94vw,44rem)] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Settings2 aria-hidden="true" />{t("checks.settings.title")}</DialogTitle>
          <DialogDescription>
            {t("checks.settings.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto pr-1">
          {frame.phase === "loading" ? <p className="py-8 text-center text-muted-foreground">{t("checks.settings.loading")}</p> : null}
          {frame.phase === "failed" ? (
            <Alert variant="destructive">
              <AlertTitle>{frame.conflict ? t("checks.settings.changed.title") : t("checks.settings.unavailable.title")}</AlertTitle>
              <AlertDescription>
                {frame.conflict
                  ? t("checks.settings.changed.description")
                  : t("checks.settings.unavailable.description")}
              </AlertDescription>
              <Button className="mt-3" onClick={() => void load()} size="sm" variant="outline">{t("common.action.retry")}</Button>
            </Alert>
          ) : null}
          {frame.phase === "ready" ? (
            <ChecksSettingsEditor
              catalog={catalog}
              draft={frame.draft}
              editable={frame.settings.canEdit}
              namespaceInput={namespaceInput}
              onDraftChange={(draft) => setFrame({ ...frame, draft })}
              onNamespaceInputChange={setNamespaceInput}
            />
          ) : null}
        </div>

        <DialogFooter>
          <Button disabled={saving} onClick={close} variant="outline">{t("common.action.cancel")}</Button>
          <Button
            disabled={frame.phase !== "ready" || !frame.settings.canEdit || saving || !validPendingNamespace(namespaceInput)}
            onClick={() => void save()}
          >
            {saving ? t("checks.settings.saving") : t("common.action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChecksSettingsEditor({
  catalog,
  draft,
  editable,
  namespaceInput,
  onDraftChange,
  onNamespaceInputChange,
}: {
  catalog: readonly ChecksCatalogEntry[];
  draft: ChecksSettingsPolicy;
  editable: boolean;
  namespaceInput: string;
  onDraftChange(draft: ChecksSettingsPolicy): void;
  onNamespaceInputChange(value: string): void;
}) {
  const { t } = useI18n();
  const checks = useMemo(() => mergeChecks(catalog, draft.hiddenCheckIds), [catalog, draft.hiddenCheckIds]);
  const categories = useMemo(
    () => sortedUnique([...catalog.map((entry) => entry.category), ...draft.hiddenCategories]),
    [catalog, draft.hiddenCategories],
  );
  const namespace = namespaceInput.trim();
  const namespaceValid = validNamespaceReference(namespace);
  const namespaceDuplicate = draft.hiddenNamespaces.includes(namespace);

  return (
    <div className="grid gap-6">
      {!editable ? (
        <Alert>
          <AlertTitle>{t("checks.settings.readOnly.title")}</AlertTitle>
          <AlertDescription>{t("checks.settings.readOnly.description")}</AlertDescription>
        </Alert>
      ) : null}

      <SettingsSection description={t("checks.settings.checks.description")} title={t("checks.settings.checks.title")}>
        {checks.length === 0 ? <p className="text-sm text-muted-foreground">{t("checks.settings.checks.empty")}</p> : (
          <ul className="grid gap-1">
            {checks.map((check) => (
              <li key={check.id}>
                <label className="flex min-w-0 items-start gap-3 rounded-lg border p-3">
                  <input
                    checked={!draft.hiddenCheckIds.includes(check.id)}
                    className="mt-0.5 size-4"
                    disabled={!editable}
                    onChange={() => onDraftChange({
                      ...draft,
                      hiddenCheckIds: toggledHidden(draft.hiddenCheckIds, check.id),
                    })}
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="block break-words font-medium">{check.title}</span>
                    <span className="block break-all text-xs text-muted-foreground">{check.id}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection description={t("checks.settings.categories.description")} title={t("checks.settings.categories.title")}>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <Button
              aria-pressed={!draft.hiddenCategories.includes(category)}
              disabled={!editable}
              key={category}
              onClick={() => onDraftChange({
                ...draft,
                hiddenCategories: toggledHidden(draft.hiddenCategories, category),
              })}
              size="sm"
              variant={draft.hiddenCategories.includes(category) ? "outline" : "secondary"}
            >
              {category}
            </Button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection description={t("checks.settings.namespaces.description")} title={t("checks.settings.namespaces.title")}>
        <ul className="grid gap-2">
          {draft.hiddenNamespaces.map((reference) => (
            <li className="flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2" key={reference}>
              <span className="min-w-0 break-all text-sm">{reference}</span>
              <Button
                aria-label={t("checks.settings.namespaces.remove", { reference })}
                disabled={!editable}
                onClick={() => onDraftChange({
                  ...draft,
                  hiddenNamespaces: draft.hiddenNamespaces.filter((value) => value !== reference),
                })}
                size="icon-sm"
                variant="ghost"
              ><Trash2 aria-hidden="true" /></Button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <Input
            aria-invalid={namespace.length > 0 && (!namespaceValid || namespaceDuplicate)}
            disabled={!editable}
            onChange={(event) => onNamespaceInputChange(event.target.value)}
            placeholder={t("checks.settings.namespaces.placeholder")}
            value={namespaceInput}
          />
          <Button
            aria-label={t("checks.settings.namespaces.add")}
            disabled={!editable || !namespaceValid || namespaceDuplicate}
            onClick={() => {
              onDraftChange({ ...draft, hiddenNamespaces: sortedUnique([...draft.hiddenNamespaces, namespace]) });
              onNamespaceInputChange("");
            }}
            size="icon"
          ><Plus aria-hidden="true" /></Button>
        </div>
        {namespace.length > 0 && !namespaceValid ? <p className="mt-1 text-xs text-destructive">{t("checks.settings.namespaces.invalid")}</p> : null}
        {namespaceDuplicate ? <p className="mt-1 text-xs text-destructive">{t("checks.settings.namespaces.duplicate")}</p> : null}
      </SettingsSection>
    </div>
  );
}

function SettingsSection({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return (
    <section>
      <h3 className="font-medium">{title}</h3>
      <p className="mb-3 mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}

function mergeChecks(catalog: readonly ChecksCatalogEntry[], hidden: readonly string[]) {
  const values = new Map(catalog.map((entry) => [entry.checkId, { id: entry.checkId, title: entry.title }]));
  for (const id of hidden) if (!values.has(id)) values.set(id, { id, title: id });
  return [...values.values()].sort((left, right) => left.title.localeCompare(right.title));
}

function toggledHidden(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : sortedUnique([...values, value]);
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function validPendingNamespace(value: string): boolean {
  const normalized = value.trim();
  return normalized.length === 0 || validNamespaceReference(normalized);
}

function validNamespaceReference(value: string): boolean {
  const separator = value.indexOf("/");
  if (separator <= 0 || value.indexOf("/", separator + 1) >= 0) return false;
  return isStableFilterValue(value.slice(0, separator)) && isKubernetesNamespace(value.slice(separator + 1));
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
