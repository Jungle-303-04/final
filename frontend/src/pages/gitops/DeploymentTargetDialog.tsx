import { ChevronLeft, ChevronRight, GitBranch, Plus } from "lucide-react";
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
import { Spinner } from "../../shared/ui/primitives/spinner";
import {
  DeployTargetStep,
  DeploymentTargetSteps,
  ManifestTargetStep,
  RepositoryTargetStep,
  type DeploymentTargetStep,
} from "./DeploymentTargetDialogSteps";
import { isGitRepositoryReference } from "./gitRepositoryPresentation";

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
  const [step, setStep] = useState<DeploymentTargetStep>(1);
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
  const valid = {
    1: input.name.trim() !== "" && isGitRepositoryReference(input.repository),
    2: input.branch.trim() !== "" && input.manifestPath.trim() !== "",
    3: clusterId !== "" && input.namespace.trim() !== "" && input.environment.trim() !== "",
  } satisfies Record<DeploymentTargetStep, boolean>;

  const update = (field: keyof ReleaseTargetInput, value: string) => {
    setInput((current) => ({ ...current, [field]: value }));
    setFailed(false);
  };
  const reset = () => {
    setStep(1);
    setInput(INITIAL_TARGET);
    setFailed(false);
  };
  const changeOpen = (nextOpen: boolean) => {
    if (pending) return;
    setOpen(nextOpen);
    if (!nextOpen) reset();
  };
  const submit = async () => {
    if (!valid[1] || !valid[2] || !valid[3] || pending) return;
    const created = await onCreate({ ...input, clusterId });
    if (!created) {
      setFailed(true);
      return;
    }
    setOpen(false);
    reset();
  };

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Plus aria-hidden="true" />
        {t("workflows.target.new")}
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-hidden p-0 sm:max-w-3xl"
        closeLabel={t("common.action.close")}
        showCloseButton={!pending}
      >
        <DialogHeader className="gap-3 border-b px-6 pb-5 pt-6 sm:px-8 sm:pt-7">
          <div className="flex items-center gap-3 pr-8">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-data-accent text-data-accent-foreground">
              <GitBranch aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle>{t("workflows.target.title")}</DialogTitle>
              <DialogDescription className="mt-1 leading-relaxed">{t("workflows.target.description")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DeploymentTargetSteps activeStep={step} />

        <div className="min-h-0 overflow-y-auto px-6 py-5 sm:px-8 sm:py-6">
          {failed ? (
            <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm" role="alert">
              {t("workflows.target.createError")}
            </div>
          ) : null}
          {step === 1 ? <RepositoryTargetStep input={input} update={update} /> : null}
          {step === 2 ? <ManifestTargetStep input={input} update={update} /> : null}
          {step === 3 ? (
            <DeployTargetStep
              clusterId={clusterId}
              connectedClusters={connectedClusters}
              input={input}
              selectedCluster={selectedCluster}
              update={update}
            />
          ) : null}
        </div>

        <DialogFooter className="border-t px-6 py-4 sm:px-8">
          <Button disabled={pending} onClick={() => changeOpen(false)} variant="ghost">
            {t("common.action.cancel")}
          </Button>
          <div className="flex flex-1 justify-end gap-2">
            {step > 1 ? (
              <Button disabled={pending} onClick={() => setStep((step - 1) as DeploymentTargetStep)} variant="outline">
                <ChevronLeft aria-hidden="true" />
                {t("workflows.target.back")}
              </Button>
            ) : null}
            {step < 3 ? (
              <Button disabled={!valid[step] || pending} onClick={() => setStep((step + 1) as DeploymentTargetStep)}>
                {t("workflows.target.next")}
                <ChevronRight aria-hidden="true" />
              </Button>
            ) : (
              <Button aria-busy={pending} disabled={!valid[3] || pending} onClick={() => void submit()}>
                {pending ? <Spinner decorative /> : <Plus aria-hidden="true" />}
                {pending ? t("workflows.target.creating") : t("workflows.target.create")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
