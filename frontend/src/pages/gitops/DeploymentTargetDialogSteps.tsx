import { Check, GitBranch, LockKeyhole, Server } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReleaseCluster, ReleaseTargetInput } from "../../features/gitops/gitOpsContract";
import { useI18n, type MessageKey } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Badge } from "../../shared/ui/primitives/badge";
import { Input } from "../../shared/ui/primitives/input";
import { FormField, NativeSelect } from "./WorkflowFormControls";
import { DeploymentTargetPreview } from "./DeploymentTargetPreview";
import {
  detectGitRepositoryProvider,
  gitProviderLabelKey,
  isGitRepositoryReference,
} from "./gitRepositoryPresentation";

export type DeploymentTargetStep = 1 | 2 | 3;

const stepKeys = [
  "workflows.target.steps.repository",
  "workflows.target.steps.manifest",
  "workflows.target.steps.deploy",
] as const satisfies readonly MessageKey[];

export function DeploymentTargetSteps({ activeStep }: { activeStep: DeploymentTargetStep }) {
  const { t } = useTargetI18n();
  return (
    <ol aria-label={t("workflows.target.steps.aria")} className="grid grid-cols-3 border-b px-6 sm:px-8">
      {stepKeys.map((key, index) => {
        const number = index + 1;
        const active = number === activeStep;
        const complete = number < activeStep;
        return (
          <li
            aria-current={active ? "step" : undefined}
            className={cn(
              "relative flex min-w-0 items-center justify-center gap-2 py-4 text-xs font-semibold text-muted-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:bg-data-accent after:transition-transform after:duration-(--motion-layout) after:ease-(--ease-spring) motion-reduce:after:transition-none",
              (active || complete) && "text-foreground after:scale-x-100",
            )}
            key={key}
          >
            <span className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[0.6875rem]",
              (active || complete) && "bg-data-accent text-data-accent-foreground",
            )}>
              {complete ? <Check aria-hidden="true" className="size-3.5" strokeWidth={3} /> : number}
            </span>
            <span className="truncate">{t(key)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function RepositoryTargetStep({ input, update }: TargetStepProps) {
  const { t } = useTargetI18n();
  const repositoryValid = isGitRepositoryReference(input.repository);
  const provider = detectGitRepositoryProvider(input.repository);
  return (
    <section className="motion-wizard-stage grid gap-5">
      <StepIntroduction icon={GitBranch} text={t("workflows.target.repositoryDescription")} />
      <FormField label={t("workflows.target.name")}>
        <Input
          aria-label={t("workflows.target.name")}
          autoFocus
          className="h-11 rounded-xl bg-muted/35 px-3.5"
          onChange={(event) => update("name", event.currentTarget.value)}
          value={input.name}
        />
      </FormField>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="target-repository">
            {t("workflows.target.repository")}
          </label>
          {input.repository.trim() ? (
            <Badge aria-live="polite" className="shrink-0" role="status" variant="outline">
              {t("workflows.target.providerDetected", { provider: t(gitProviderLabelKey(provider)) })}
            </Badge>
          ) : null}
        </div>
        <Input
          aria-invalid={input.repository.trim() !== "" && !repositoryValid ? true : undefined}
          autoCapitalize="none"
          className="h-11 rounded-xl bg-muted/35 px-3.5 font-mono"
          id="target-repository"
          onChange={(event) => update("repository", event.currentTarget.value)}
          placeholder={t("workflows.target.repositoryPlaceholder")}
          spellCheck={false}
          value={input.repository}
        />
        {input.repository.trim() && !repositoryValid ? (
          <span className="text-xs text-destructive" role="alert">{t("workflows.target.repositoryInvalid")}</span>
        ) : null}
      </div>
      <FormField label={t("workflows.target.token")}>
        <Input
          aria-label={t("workflows.target.token")}
          autoComplete="new-password"
          className="h-11 rounded-xl bg-muted/35 px-3.5 font-mono"
          onChange={(event) => update("token", event.currentTarget.value)}
          spellCheck={false}
          type="password"
          value={input.token || ""}
        />
      </FormField>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <LockKeyhole aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-status-healthy" />
        {t("workflows.target.tokenDescription")}
      </p>
    </section>
  );
}

export function ManifestTargetStep({ input, update }: TargetStepProps) {
  const { t } = useTargetI18n();
  return (
    <section className="motion-wizard-stage grid gap-5">
      <StepIntroduction icon={GitBranch} text={t("workflows.target.manifestDescription")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("workflows.target.branch")}>
          <Input aria-label={t("workflows.target.branch")} autoCapitalize="none" autoFocus className="h-11 rounded-xl bg-muted/35 px-3.5 font-mono" onChange={(event) => update("branch", event.currentTarget.value)} spellCheck={false} value={input.branch} />
        </FormField>
        <FormField label={t("workflows.target.manifestPath")}>
          <Input aria-label={t("workflows.target.manifestPath")} autoCapitalize="none" className="h-11 rounded-xl bg-muted/35 px-3.5 font-mono" onChange={(event) => update("manifestPath", event.currentTarget.value)} spellCheck={false} value={input.manifestPath} />
        </FormField>
      </div>
      <SourceSummary input={input} />
    </section>
  );
}

export function DeployTargetStep({
  clusterId,
  connectedClusters,
  input,
  selectedCluster,
  update,
}: TargetStepProps & {
  clusterId: string;
  connectedClusters: ReleaseCluster[];
  selectedCluster: ReleaseCluster | null;
}) {
  const { t } = useTargetI18n();
  return (
    <section className="motion-wizard-stage grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)] lg:items-start">
      <div className="grid gap-5">
        <StepIntroduction icon={Server} text={t("workflows.target.deployDescription")} />
        <FormField error={!connectedClusters.length ? t("workflows.target.connectClusterFirst") : undefined} label={t("workflows.target.cluster")}>
          <NativeSelect disabled={!connectedClusters.length} onChange={(value) => update("clusterId", value)} value={clusterId}>
            {connectedClusters.length ? connectedClusters.map((cluster) => (
              <option key={cluster.id} value={cluster.id}>{cluster.name} · {cluster.environment}</option>
            )) : <option value="">{t("workflows.target.noClusters")}</option>}
          </NativeSelect>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("workflows.target.namespace")}>
            <Input aria-label={t("workflows.target.namespace")} autoCapitalize="none" className="h-11 rounded-xl bg-muted/35 px-3.5 font-mono" onChange={(event) => update("namespace", event.currentTarget.value)} spellCheck={false} value={input.namespace} />
          </FormField>
          <FormField label={t("workflows.target.environment")}>
            <NativeSelect onChange={(value) => update("environment", value)} value={input.environment}>
              <option value="development">{t("workflows.option.environment.development")}</option>
              <option value="staging">{t("workflows.option.environment.staging")}</option>
              <option value="production">{t("workflows.option.environment.production")}</option>
            </NativeSelect>
          </FormField>
        </div>
        <p className="rounded-xl border bg-muted/25 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {t("workflows.target.summary.sync")}
        </p>
      </div>
      <DeploymentTargetPreview cluster={selectedCluster} input={{ ...input, clusterId }} />
    </section>
  );
}

type TargetStepProps = {
  input: ReleaseTargetInput;
  update: (field: keyof ReleaseTargetInput, value: string) => void;
};

function StepIntroduction({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-muted/25 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-data-accent/10 text-data-accent"><Icon aria-hidden="true" className="size-4" /></span>
      <p className="pt-0.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function SourceSummary({ input }: { input: ReleaseTargetInput }) {
  const { t } = useTargetI18n();
  return (
    <div className="grid gap-2 rounded-xl border bg-muted/25 p-4">
      <span className="text-xs font-medium text-muted-foreground">{t("workflows.target.summary.source")}</span>
      <strong className="truncate text-sm" title={input.repository}>{input.repository}</strong>
      <span className="truncate font-mono text-xs text-muted-foreground" title={`${input.branch} · ${input.manifestPath}`}>{input.branch} · {input.manifestPath}</span>
    </div>
  );
}

function useTargetI18n() {
  return useI18n();
}
