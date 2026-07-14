import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  FileCode2,
  GitPullRequestArrow,
  PackageCheck,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type {
  GeneratedManifest,
  ReleasePlan,
  SafePrResult,
} from "../../features/gitops/gitOpsContract";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Surface } from "../../shared/ui/Surface";
import { NativeSelect } from "./PlanEditor";
import { WorkflowInlineHeading } from "./WorkflowInlineHeading";

export function ManifestWorkspace({
  plan,
  result,
  safePr,
  pending,
  onGenerate,
  onSafePr,
}: {
  plan: ReleasePlan;
  result?: GeneratedManifest;
  safePr?: SafePrResult;
  pending: "idle" | "generate" | "safe-pr";
  onGenerate: (stepIndex: number) => void;
  onSafePr: (stepIndex: number) => void;
}) {
  const { t } = useI18n();
  const [stepIndex, setStepIndex] = useState(0);
  const selectedStepIndex = Math.min(stepIndex, Math.max(0, plan.steps.length - 1));
  const safePrSummary = safePr
    ? `${t("workflows.yaml.workflowRun")}: ${safePr.workflow_run_id} / ${safePr.repo_ref} / ${safePr.base_branch} / ${safePr.manifest_path}`
    : "";

  return (
    <div className="grid min-w-0 gap-4">
      <WorkflowInlineHeading
        description={t("workflows.yaml.description")}
        title={t("workflows.yaml.title")}
      />

      <Surface aria-label={t("workflows.yaml.title")} className="flex min-w-0 flex-col items-stretch gap-3 p-3 xl:flex-row xl:items-end xl:justify-between">
        <label className="grid w-full min-w-0 gap-1.5 xl:max-w-xl">
          <span className="text-xs font-medium text-muted-foreground">{t("workflows.yaml.target")}</span>
          <NativeSelect
            disabled={!plan.steps.length}
            onChange={(value) => setStepIndex(Number(value))}
            value={String(selectedStepIndex)}
          >
            {plan.steps.map((step, index) => (
              <option key={step.step_id || step.application_id} value={String(index)}>
                {step.name || step.application_id}
              </option>
            ))}
          </NativeSelect>
        </label>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row xl:w-auto">
          <Button
            disabled={!plan.steps.length || pending !== "idle"}
            onClick={() => onGenerate(selectedStepIndex)}
            variant="outline"
          >
            <Code2 aria-hidden="true" />
            {pending === "generate" ? t("workflows.yaml.generating") : t("workflows.yaml.generate")}
          </Button>
          <Button
            disabled={!result || pending !== "idle"}
            onClick={() => onSafePr(selectedStepIndex)}
          >
            <GitPullRequestArrow aria-hidden="true" />
            {pending === "safe-pr" ? t("workflows.yaml.submitting") : t("workflows.yaml.safePr")}
          </Button>
        </div>
      </Surface>

      {safePr ? (
        <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
          <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-emerald-600" />
          <strong className="shrink-0 text-xs">{t("workflows.yaml.safePrAccepted")}</strong>
          <span className="min-w-0 flex-1 truncate border-l pl-2 text-xs text-muted-foreground" title={safePrSummary}>
            {safePrSummary}
          </span>
        </div>
      ) : null}

      {result ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,.65fr)]">
          <Surface aria-label={t("workflows.yaml.title")} className="min-w-0 overflow-hidden">
            <div className="flex min-w-0 items-center justify-between gap-3 border-b px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <FileCode2 aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <strong className="truncate text-xs">{plan.steps[selectedStepIndex]?.name || plan.steps[selectedStepIndex]?.application_id}</strong>
              </div>
              <Badge variant="secondary">{result.resource_count}</Badge>
            </div>
            <pre className="m-0 min-h-[28rem] max-h-[52rem] min-w-0 overflow-auto bg-muted/30 p-4 text-xs leading-5 whitespace-pre text-foreground">
              <code>{result.manifest}</code>
            </pre>
          </Surface>

          <div className="grid min-w-0 content-start gap-4">
            <ManifestList
              empty={t("workflows.value.notSet")}
              icon={<FileCode2 aria-hidden="true" />}
              title={t("workflows.yaml.files")}
            >
              {result.files.map((file) => (
                <div className="grid min-w-0 gap-0.5 rounded-lg border px-3 py-2" key={file.path}>
                  <span className="text-xs font-medium [overflow-wrap:anywhere]">{file.path}</span>
                  <small className="text-[0.6875rem] leading-4 text-muted-foreground [overflow-wrap:anywhere]">
                    {file.action} · {file.description}
                  </small>
                </div>
              ))}
            </ManifestList>
            <ManifestList
              empty={t("workflows.value.notSet")}
              icon={<PackageCheck aria-hidden="true" />}
              title={t("workflows.yaml.resources")}
            >
              {result.resources.map((resource) => (
                <div className="grid min-w-0 gap-0.5 rounded-lg border px-3 py-2" key={`${resource.kind}/${resource.namespace}/${resource.name}`}>
                  <span className="text-xs font-medium [overflow-wrap:anywhere]">
                    {resource.kind} / {resource.name}
                  </span>
                  <small className="text-[0.6875rem] text-muted-foreground [overflow-wrap:anywhere]">
                    {resource.namespace}
                  </small>
                </div>
              ))}
            </ManifestList>
            <ManifestList
              empty={t("workflows.yaml.noDiagnostics")}
              icon={<AlertTriangle aria-hidden="true" />}
              title={t("workflows.yaml.diagnostics")}
            >
              {result.diagnostics.map((diagnostic, index) => (
                <div
                  className={`grid min-w-0 gap-0.5 rounded-lg border px-3 py-2 ${diagnostic.severity === "error" ? "border-destructive/40" : "border-amber-500/40"}`}
                  key={`${diagnostic.code}-${diagnostic.line}-${index}`}
                >
                  <span className="text-xs font-medium [overflow-wrap:anywhere]">{diagnostic.message}</span>
                  <small className="text-[0.6875rem] text-muted-foreground [overflow-wrap:anywhere]">
                    {diagnostic.code} · {diagnostic.path || result.files[0]?.path || t("workflows.value.notSet")}:{diagnostic.line}
                  </small>
                </div>
              ))}
            </ManifestList>
          </div>
        </div>
      ) : (
        <div className="grid min-h-80 place-items-center rounded-xl border border-dashed px-6 text-center text-sm leading-6 text-muted-foreground">
          {t("workflows.yaml.empty")}
        </div>
      )}
    </div>
  );
}

function ManifestList({
  icon,
  title,
  empty,
  children,
}: {
  icon: ReactNode;
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const entries = Array.isArray(children) ? children : [children];
  return (
    <Surface aria-label={title} className="grid min-w-0 gap-3 p-3">
      <div className="flex min-w-0 items-center gap-2 text-xs font-semibold [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-primary">
        {icon}
        <span className="truncate">{title}</span>
      </div>
      {entries.length && entries.some(Boolean)
        ? <div className="grid min-w-0 gap-1.5">{children}</div>
        : <span className="text-xs text-muted-foreground">{empty}</span>}
    </Surface>
  );
}
