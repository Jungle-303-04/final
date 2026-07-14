import {
  CheckCircle2,
  CircleDashed,
  GitBranch,
  Server,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  ReleaseCluster,
  ReleaseTargetInput,
} from "../../features/gitops/gitOpsContract";
import { useI18n, type TranslationFunction } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";

export function DeploymentTargetPreview({
  cluster,
  input,
}: {
  cluster: ReleaseCluster | null;
  input: ReleaseTargetInput;
}) {
  const { t } = useI18n();
  const sourceReady = [input.repository, input.branch, input.manifestPath]
    .every((value) => value.trim() !== "");
  const destinationReady = cluster !== null &&
    input.namespace.trim() !== "" &&
    input.environment.trim() !== "";
  const identityReady = input.name.trim() !== "";
  const complete = identityReady && sourceReady && destinationReady;
  const missing = t("workflows.value.notSet");

  return (
    <aside
      aria-label={t("workflows.target.preview.title")}
      className="motion-live-preview grid min-h-[25rem] min-w-0 content-start gap-4 rounded-xl border bg-muted/25 p-4"
      data-complete={complete || undefined}
    >
      <header className="flex min-w-0 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <GitBranch aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{t("workflows.target.preview.title")}</h3>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {t("workflows.target.preview.description")}
          </p>
        </div>
        <Badge aria-live="polite" role="status" variant={complete ? "secondary" : "outline"}>
          {t(complete
            ? "workflows.target.preview.ready"
            : "workflows.target.preview.incomplete")}
        </Badge>
      </header>

      <section className="grid min-w-0 gap-1 rounded-lg border bg-card p-3">
        <span className="text-[0.6875rem] font-medium text-muted-foreground">
          {t("workflows.target.name")}
        </span>
        <strong
          className="motion-live-preview-value truncate text-sm"
          data-complete={identityReady || undefined}
          title={input.name || missing}
        >
          {input.name || missing}
        </strong>
        <Badge className="mt-1" variant="outline">
          {environmentLabel(input.environment, t)}
        </Badge>
      </section>

      <PreviewStage
        complete={sourceReady}
        icon={GitBranch}
        label={t("workflows.target.preview.source")}
        primary={input.repository || missing}
        secondary={`${input.branch || missing} · ${input.manifestPath || missing}`}
      />
      <PreviewStage
        complete={destinationReady}
        icon={Server}
        label={t("workflows.target.preview.destination")}
        primary={cluster?.name || missing}
        secondary={`${cluster?.environment || missing} · ${input.namespace || missing}`}
      />

      <div className="mt-auto grid gap-2 border-t pt-3 text-xs text-muted-foreground">
        <ReadinessLine complete={identityReady} label={t("workflows.target.preview.identityCheck")} />
        <ReadinessLine complete={sourceReady} label={t("workflows.target.preview.sourceCheck")} />
        <ReadinessLine complete={destinationReady} label={t("workflows.target.preview.destinationCheck")} />
        {input.token ? (
          <p className="flex items-center gap-2 text-foreground">
            <CheckCircle2 aria-hidden="true" className="size-3.5 text-status-healthy" />
            {t("workflows.target.preview.tokenProtected")}
          </p>
        ) : null}
      </div>
    </aside>
  );
}

function PreviewStage({
  complete,
  icon: Icon,
  label,
  primary,
  secondary,
}: {
  complete: boolean;
  icon: LucideIcon;
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <section
      className="motion-live-preview-value grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-lg border bg-card p-3"
      data-complete={complete || undefined}
    >
      <span className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="grid min-w-0 gap-0.5">
        <span className="text-[0.6875rem] font-medium text-muted-foreground">{label}</span>
        <strong className="truncate text-sm" title={primary}>{primary}</strong>
        <span className="truncate text-xs text-muted-foreground" title={secondary}>{secondary}</span>
      </div>
    </section>
  );
}

function ReadinessLine({ complete, label }: { complete: boolean; label: string }) {
  const Icon = complete ? CheckCircle2 : CircleDashed;
  return (
    <p className={complete ? "flex items-center gap-2 text-foreground" : "flex items-center gap-2"}>
      <Icon
        aria-hidden="true"
        className={complete ? "size-3.5 text-status-healthy" : "size-3.5"}
      />
      {label}
    </p>
  );
}

function environmentLabel(
  environment: string,
  t: TranslationFunction,
): string {
  if (environment === "production") return t("workflows.option.environment.production");
  if (environment === "staging") return t("workflows.option.environment.staging");
  return t("workflows.option.environment.development");
}
