import { LoaderCircle, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  ReleaseApplication,
  ReleaseCluster,
  ReleaseTargetInput,
} from "../../features/gitops/gitOpsContract";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../shared/ui/primitives/dialog";
import { Input } from "../../shared/ui/primitives/input";
import { FormField, NativeSelect } from "./WorkflowFormControls";
import { DeploymentTargetPreview } from "./DeploymentTargetPreview";

const INITIAL_TARGET: ReleaseTargetInput = {
  name: "",
  repository: "",
  branch: "main",
  manifestPath: "deploy.yaml",
  clusterId: "",
  namespace: "default",
  environment: "development",
  token: "",
};

export function DeploymentTargetDialog({
  clusters,
  pending,
  onCreate,
}: {
  clusters: ReleaseCluster[];
  pending: boolean;
  onCreate: (input: ReleaseTargetInput) => Promise<ReleaseApplication | null>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<ReleaseTargetInput>(INITIAL_TARGET);
  const [failed, setFailed] = useState(false);
  const connectedClusters = useMemo(
    () => clusters.filter((cluster) => ["connected", "online"].includes(cluster.connectionStatus.toLowerCase())),
    [clusters],
  );
  const clusterId = connectedClusters.some((cluster) => cluster.id === input.clusterId)
    ? input.clusterId
    : connectedClusters[0]?.id || "";
  const selectedCluster = connectedClusters.find((cluster) => cluster.id === clusterId) ?? null;
  const complete = [
    input.name,
    input.repository,
    input.branch,
    input.manifestPath,
    clusterId,
    input.namespace,
    input.environment,
  ].every((value) => value.trim() !== "");

  const update = (field: keyof ReleaseTargetInput, value: string) => {
    setInput((current) => ({ ...current, [field]: value }));
    setFailed(false);
  };
  const changeOpen = (nextOpen: boolean) => {
    if (pending) return;
    setOpen(nextOpen);
    setFailed(false);
    if (!nextOpen) setInput(INITIAL_TARGET);
  };
  const submit = async () => {
    if (!complete || pending) return;
    const created = await onCreate({ ...input, clusterId });
    if (!created) {
      setFailed(true);
      return;
    }
    setOpen(false);
    setInput(INITIAL_TARGET);
  };

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Plus aria-hidden="true" />
        {t("workflows.target.new")}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl" closeLabel={t("common.action.close")} showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{t("workflows.target.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("workflows.target.description")}</DialogDescription>
        </DialogHeader>

        {failed ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs" role="alert">
            {t("workflows.target.createError")}
          </div>
        ) : null}

        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:items-start">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <FormField label={t("workflows.target.name")}>
              <Input autoFocus onChange={(event) => update("name", event.target.value)} value={input.name} />
            </FormField>
            <FormField label={t("workflows.target.repository")}>
              <Input
                autoCapitalize="none"
                onChange={(event) => update("repository", event.target.value)}
                placeholder={t("workflows.target.repositoryPlaceholder")}
                spellCheck={false}
                value={input.repository}
              />
            </FormField>
            <FormField label={t("workflows.target.branch")}>
              <Input autoCapitalize="none" onChange={(event) => update("branch", event.target.value)} spellCheck={false} value={input.branch} />
            </FormField>
            <FormField label={t("workflows.target.manifestPath")}>
              <Input autoCapitalize="none" onChange={(event) => update("manifestPath", event.target.value)} spellCheck={false} value={input.manifestPath} />
            </FormField>
            <FormField
              error={!connectedClusters.length ? t("workflows.target.connectClusterFirst") : undefined}
              label={t("workflows.target.cluster")}
            >
              <NativeSelect
                disabled={!connectedClusters.length}
                onChange={(value) => update("clusterId", value)}
                value={clusterId}
              >
                {connectedClusters.length ? connectedClusters.map((cluster) => (
                  <option key={cluster.id} value={cluster.id}>
                    {cluster.name} · {cluster.environment}
                  </option>
                )) : <option value="">{t("workflows.target.noClusters")}</option>}
              </NativeSelect>
            </FormField>
            <FormField label={t("workflows.target.namespace")}>
              <Input autoCapitalize="none" onChange={(event) => update("namespace", event.target.value)} spellCheck={false} value={input.namespace} />
            </FormField>
            <FormField label={t("workflows.target.environment")}>
              <NativeSelect onChange={(value) => update("environment", value)} value={input.environment}>
                <option value="development">{t("workflows.option.environment.development")}</option>
                <option value="staging">{t("workflows.option.environment.staging")}</option>
                <option value="production">{t("workflows.option.environment.production")}</option>
              </NativeSelect>
            </FormField>
            <FormField label={t("workflows.target.token")}>
              <Input
                autoComplete="new-password"
                onChange={(event) => update("token", event.target.value)}
                spellCheck={false}
                type="password"
                value={input.token || ""}
              />
            </FormField>
          </div>
          <DeploymentTargetPreview
            cluster={selectedCluster}
            input={{ ...input, clusterId }}
          />
        </div>

        <DialogFooter>
          <Button disabled={!complete || pending} onClick={() => void submit()}>
            {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Plus aria-hidden="true" />}
            {pending ? t("workflows.target.creating") : t("workflows.target.create")}
          </Button>
          <Button disabled={pending} onClick={() => changeOpen(false)} variant="outline">
            {t("common.action.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
