import { GitBranch, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { useOptionalProductNotifications } from "../../features/notifications/ProductNotificationsProvider";
import type {
  ReleaseApplication,
  ReleaseCluster,
  ReleaseTargetInput,
} from "../../features/gitops/gitOpsContract";
import { useI18n } from "../../shared/i18n";
import { ConnectStages, type ConnectStageTriplet } from "../../shared/ui/connect";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
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
import { Spinner } from "../../shared/ui/primitives/spinner";
import { FormField, NativeSelect } from "./WorkflowFormControls";

type ConnectPhase = "configure" | "registering" | "reflecting" | "failed";
type FailureStage = "register" | "reflect";

const INITIAL_INPUT: ReleaseTargetInput = {
  name: "",
  repository: "",
  branch: "main",
  manifestPath: "deploy.yaml",
  clusterId: "",
  namespace: "default",
  environment: "development",
};

export function RepoConnectDialog({
  clusters,
  onCreate,
  pending,
}: {
  clusters: ReleaseCluster[];
  onCreate: (
    input: ReleaseTargetInput,
    onRegistered?: () => void,
  ) => Promise<ReleaseApplication | null>;
  pending: boolean;
}) {
  const { t } = useI18n();
  const notifications = useOptionalProductNotifications();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<ConnectPhase>("configure");
  const [failureStage, setFailureStage] = useState<FailureStage>("register");
  const [input, setInput] = useState<ReleaseTargetInput>(INITIAL_INPUT);
  const connectedClusters = useMemo(
    () => clusters.filter((cluster) => (
      ["connected", "online"].includes(cluster.connectionStatus.toLowerCase())
    )),
    [clusters],
  );
  const clusterId = connectedClusters.some((cluster) => cluster.id === input.clusterId)
    ? input.clusterId
    : connectedClusters[0]?.id ?? "";
  const complete = [
    input.name,
    input.repository,
    input.branch,
    input.manifestPath,
    clusterId,
    input.namespace,
    input.environment,
  ].every((value) => value.trim() !== "");
  const stages = repoConnectStages(phase, pending, complete, t, failureStage);

  const changeOpen = (next: boolean) => {
    if (pending) return;
    setOpen(next);
    setPhase("configure");
    setFailureStage("register");
    if (!next) setInput(INITIAL_INPUT);
  };
  const update = (field: keyof ReleaseTargetInput, value: string) => {
    setInput((current) => ({ ...current, [field]: value }));
    setPhase("configure");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!complete || pending) return;
    let registered = false;
    setPhase("registering");
    const created = await onCreate({
      name: input.name,
      repository: input.repository,
      branch: input.branch,
      manifestPath: input.manifestPath,
      clusterId,
      namespace: input.namespace,
      environment: input.environment,
    }, () => {
      registered = true;
      setPhase("reflecting");
    });
    if (created === null) {
      setFailureStage(registered ? "reflect" : "register");
      setPhase("failed");
      return;
    }
    notifications?.publish({
      description: t("connections.repository.notification.description", {
        name: created.name,
      }),
      href: "/deploy?section=repositories",
      id: `repository-connected:${created.id}`,
      occurredAt: new Date().toISOString(),
      title: t("connections.repository.notification.title"),
      tone: "healthy",
    });
    setOpen(false);
    setPhase("configure");
    setInput(INITIAL_INPUT);
  };

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger render={<Button />}>
        <Plus aria-hidden="true" />
        {t("connections.repository.connect")}
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl"
        closeLabel={t("common.action.close")}
        showCloseButton={!pending}
      >
        <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <GitBranch aria-hidden="true" className="size-4" />
              <DialogTitle>{t("connections.repository.connectTitle")}</DialogTitle>
            </div>
            <DialogDescription>
              {t("connections.repository.connectDescription")}
            </DialogDescription>
          </DialogHeader>
          <ConnectStages
            ariaLabel={t("connections.repository.progress")}
            stages={stages}
          />
          <Alert>
            <AlertDescription>
              {t("connections.repository.credential.description")}
            </AlertDescription>
          </Alert>
          {phase === "failed" ? (
            <Alert variant="destructive">
              <AlertDescription>{t("connections.repository.failed")}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <FormField label={t("workflows.target.name")}>
              <Input
                autoFocus
                onChange={(event) => update("name", event.currentTarget.value)}
                value={input.name}
              />
            </FormField>
            <FormField label={t("workflows.target.repository")}>
              <Input
                autoCapitalize="none"
                onChange={(event) => update("repository", event.currentTarget.value)}
                placeholder={t("workflows.target.repositoryPlaceholder")}
                spellCheck={false}
                value={input.repository}
              />
            </FormField>
            <FormField label={t("workflows.target.branch")}>
              <Input
                autoCapitalize="none"
                onChange={(event) => update("branch", event.currentTarget.value)}
                spellCheck={false}
                value={input.branch}
              />
            </FormField>
            <FormField label={t("workflows.target.manifestPath")}>
              <Input
                autoCapitalize="none"
                onChange={(event) => update("manifestPath", event.currentTarget.value)}
                spellCheck={false}
                value={input.manifestPath}
              />
            </FormField>
            <FormField
              error={!connectedClusters.length
                ? t("workflows.target.connectClusterFirst")
                : undefined}
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
              <Input
                autoCapitalize="none"
                onChange={(event) => update("namespace", event.currentTarget.value)}
                spellCheck={false}
                value={input.namespace}
              />
            </FormField>
            <FormField label={t("workflows.target.environment")}>
              <NativeSelect
                onChange={(value) => update("environment", value)}
                value={input.environment}
              >
                <option value="development">{t("workflows.option.environment.development")}</option>
                <option value="staging">{t("workflows.option.environment.staging")}</option>
                <option value="production">{t("workflows.option.environment.production")}</option>
              </NativeSelect>
            </FormField>
          </div>
          <DialogFooter>
            <Button aria-busy={pending} disabled={!complete || pending} type="submit">
              {pending ? <Spinner decorative /> : <Plus aria-hidden="true" />}
              {pending
                ? t("connections.repository.connecting")
                : t("connections.repository.connect")}
            </Button>
            <Button
              disabled={pending}
              onClick={() => changeOpen(false)}
              type="button"
              variant="outline"
            >
              {t("common.action.cancel")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function repoConnectStages(
  phase: ConnectPhase,
  pending: boolean,
  complete: boolean,
  t: ReturnType<typeof useI18n>["t"],
  failureStage: FailureStage = "register",
): ConnectStageTriplet {
  const registrationComplete = phase === "reflecting" ||
    (phase === "failed" && failureStage === "reflect");
  return [
    {
      id: "configure",
      label: t("connections.repository.stage.configure"),
      state: complete ? "complete" : "active",
    },
    {
      id: "register",
      label: t("connections.repository.stage.register"),
      state: registrationComplete
        ? "complete"
        : phase === "failed"
          ? "error"
          : phase === "registering" || pending
            ? "active"
            : "pending",
    },
    {
      id: "reflect",
      label: t("connections.repository.stage.reflect"),
      state: phase === "failed" && failureStage === "reflect"
        ? "error"
        : phase === "reflecting"
          ? "active"
          : "pending",
    },
  ];
}
