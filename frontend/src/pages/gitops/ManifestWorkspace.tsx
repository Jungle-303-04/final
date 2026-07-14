import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  FileCode2,
  GitPullRequestArrow,
  PackageCheck,
  PencilLine,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type {
  GeneratedManifest,
  ReleasePlan,
  SafePrResult,
} from "../../features/gitops/gitOpsContract";
import type { StepSetupField } from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Surface } from "../../shared/ui/Surface";
import { NativeSelect } from "./PlanEditor";
import { WorkflowWorkspaceHeader } from "./WorkflowWorkspaceHeader";

export function ManifestWorkspace({
  plan,
  result,
  safePr,
  resultStepIndex,
  safePrStepIndex,
  pending,
  onGenerate,
  onEdit,
  onSafePr,
}: {
  plan: ReleasePlan;
  result?: GeneratedManifest;
  safePr?: SafePrResult;
  resultStepIndex?: number;
  safePrStepIndex?: number;
  pending: "idle" | "generate" | "safe-pr";
  onGenerate: (stepIndex: number) => void;
  onEdit: (stepIndex?: number, field?: StepSetupField) => void;
  onSafePr: (stepIndex: number) => void;
}) {
  const { t } = useI18n();
  const [stepIndex, setStepIndex] = useState(0);
  const selectedStepIndex = Math.min(stepIndex, Math.max(0, plan.steps.length - 1));
  const selectedResult = resultStepIndex === selectedStepIndex ? result : undefined;
  const selectedSafePr = safePrStepIndex === selectedStepIndex ? safePr : undefined;
  const blockingDiagnostics = selectedResult?.diagnostics.filter((diagnostic) => diagnostic.severity === "error") || [];
  const safePrSummary = selectedSafePr
    ? `${t("workflows.yaml.workflowRun")}: ${selectedSafePr.workflow_run_id} / ${selectedSafePr.repo_ref} / ${selectedSafePr.base_branch} / ${selectedSafePr.manifest_path}`
    : "";

  return (
    <div className="grid min-w-0 gap-4">
      <WorkflowWorkspaceHeader
        actions={<>
          <Button
            disabled={!plan.steps.length || pending !== "idle"}
            onClick={() => onGenerate(selectedStepIndex)}
            variant={selectedResult ? "outline" : "default"}
          >
            <Code2 aria-hidden="true" />
            {pending === "generate" ? t("workflows.yaml.generating") : t("workflows.yaml.generate")}
          </Button>
          {blockingDiagnostics.length ? (
            <Button onClick={() => onEdit(selectedStepIndex, diagnosticField(blockingDiagnostics[0].code))}>
              <PencilLine aria-hidden="true" />
              {t("workflows.runs.editIssues")}
            </Button>
          ) : selectedResult ? (
            <Button disabled={pending !== "idle"} onClick={() => onSafePr(selectedStepIndex)}>
              <GitPullRequestArrow aria-hidden="true" />
              {pending === "safe-pr" ? t("workflows.yaml.submitting") : t("workflows.yaml.safePr")}
            </Button>
          ) : null}
        </>}
        title={t("workflows.view.yaml")}
      />

      <Surface aria-label={t("workflows.yaml.title")} className="grid min-w-0 p-3">
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
      </Surface>

      {selectedSafePr ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
          <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-emerald-600" />
          <strong className="shrink-0 text-xs">{t("workflows.yaml.safePrAccepted")}</strong>
          <span className="min-w-0 flex-1 border-l pl-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {safePrSummary}
          </span>
        </div>
      ) : null}

      {selectedResult ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,.65fr)]">
          <Surface aria-label={t("workflows.yaml.title")} className="order-2 min-w-0 overflow-hidden xl:order-1">
            <div className="flex min-w-0 items-center justify-between gap-3 border-b px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <FileCode2 aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <strong className="min-w-0 text-xs [overflow-wrap:anywhere]">{plan.steps[selectedStepIndex]?.name || plan.steps[selectedStepIndex]?.application_id}</strong>
              </div>
              <Badge variant="secondary">{selectedResult.resource_count}</Badge>
            </div>
            <pre className="m-0 min-h-[28rem] max-h-[52rem] min-w-0 overflow-auto bg-muted/30 p-4 text-xs leading-5 whitespace-pre text-foreground">
              <code>{selectedResult.manifest}</code>
            </pre>
          </Surface>

          <div className="order-1 grid min-w-0 content-start gap-4 xl:order-2">
            <ManifestList
              empty={t("workflows.yaml.noDiagnostics")}
              icon={<AlertTriangle aria-hidden="true" />}
              title={t("workflows.yaml.diagnostics")}
            >
              {selectedResult.diagnostics.map((diagnostic, index) => (
                <div
                  className={`grid min-w-0 gap-0.5 border-t py-2 first:border-t-0 ${diagnostic.severity === "error" ? "border-destructive/40" : "border-amber-500/40"}`}
                  key={`${diagnostic.code}-${diagnostic.line}-${index}`}
                >
                  <span className="text-xs font-medium [overflow-wrap:anywhere]">{diagnosticMessage(diagnostic.code, t)}</span>
                  <small className="text-[0.6875rem] text-muted-foreground [overflow-wrap:anywhere]">
                    {diagnostic.code} · {diagnostic.path || selectedResult.files[0]?.path || t("workflows.value.notSet")}:{diagnostic.line}
                  </small>
                </div>
              ))}
            </ManifestList>
            <ManifestList
              empty={t("workflows.value.notSet")}
              icon={<FileCode2 aria-hidden="true" />}
              title={t("workflows.yaml.files")}
            >
              {selectedResult.files.map((file) => (
                <div className="grid min-w-0 gap-0.5 border-t py-2 first:border-t-0" key={file.path}>
                  <span className="text-xs font-medium [overflow-wrap:anywhere]">{file.path}</span>
                  <small className="text-[0.6875rem] leading-4 text-muted-foreground [overflow-wrap:anywhere]">
                    {fileActionLabel(file.action, t)}
                  </small>
                </div>
              ))}
            </ManifestList>
            <ManifestList
              empty={t("workflows.value.notSet")}
              icon={<PackageCheck aria-hidden="true" />}
              title={t("workflows.yaml.resources")}
            >
              {selectedResult.resources.map((resource) => (
                <div className="grid min-w-0 gap-0.5 border-t py-2 first:border-t-0" key={`${resource.kind}/${resource.namespace}/${resource.name}`}>
                  <span className="text-xs font-medium [overflow-wrap:anywhere]">
                    {resource.kind} / {resource.name}
                  </span>
                  <small className="text-[0.6875rem] text-muted-foreground [overflow-wrap:anywhere]">
                    {resource.namespace}
                  </small>
                </div>
              ))}
            </ManifestList>
          </div>
        </div>
      ) : (
        <div className="grid min-h-80 place-items-center rounded-xl border border-dashed bg-muted/15 px-6 text-center">
          <div className="grid justify-items-center gap-3">
            <span className="grid size-12 place-items-center rounded-lg border bg-card text-primary shadow-sm">
              <FileCode2 aria-hidden="true" className="size-5" />
            </span>
            <strong className="text-sm">{t("workflows.yaml.empty")}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

type T = ReturnType<typeof useI18n>["t"];

function diagnosticField(code: string): StepSetupField | undefined {
  if (code.includes("commit_sha")) return "commit_sha";
  if (code.includes("image_required")) return "image";
  return undefined;
}

function diagnosticMessage(code: string, t: T): string {
  if (code.includes("commit_sha")) return t("workflows.yaml.diagnosticCommitSha");
  if (code.includes("image_required")) return t("workflows.yaml.diagnosticImage");
  if (code === "k8s.kind_limited_support") return t("workflows.yaml.diagnosticLimitedSupport");
  return t("workflows.yaml.diagnosticReview");
}

function fileActionLabel(action: string, t: T): string {
  if (action === "upsert") return t("workflows.yaml.action.upsert");
  if (action === "create") return t("workflows.yaml.action.create");
  if (action === "update") return t("workflows.yaml.action.update");
  if (action === "delete") return t("workflows.yaml.action.delete");
  return t("workflows.yaml.action.change");
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
        <span className="[overflow-wrap:anywhere]">{title}</span>
      </div>
      {entries.length && entries.some(Boolean)
        ? <div className="grid min-w-0 gap-1.5">{children}</div>
        : <span className="text-xs text-muted-foreground">{empty}</span>}
    </Surface>
  );
}
