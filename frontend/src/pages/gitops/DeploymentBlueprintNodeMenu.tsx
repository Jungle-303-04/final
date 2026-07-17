import { GitFork, Server, Trash2, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import { ContextMenu } from "radix-ui";
import { useI18n } from "../../shared/i18n";
import type { DeploymentBlueprintNode } from "./deploymentBlueprintTypes";

interface DeploymentBlueprintNodeMenuProps {
  children: ReactNode;
  node: DeploymentBlueprintNode | null;
  onClose: () => void;
  onDelete: (node: DeploymentBlueprintNode) => void;
}

export function DeploymentBlueprintNodeMenu({
  children,
  node,
  onClose,
  onDelete,
}: DeploymentBlueprintNodeMenuProps) {
  const { t } = useI18n();
  const isRepository = node?.data.kind === "repository";
  const isDeployment = node?.data.kind === "deployment";
  const isStepNode = isRepository || isDeployment;

  return (
    <ContextMenu.Root modal={false} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label={t("workflows.blueprint.nodeMenu")}
          className="z-[100] w-64 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-1.5 text-slate-100 shadow-2xl"
        >
          <ContextMenu.Label className="flex items-center gap-2 border-b border-slate-800 px-2.5 py-2">
            <span className="grid size-7 place-items-center rounded-md bg-slate-800 text-slate-300">
              {isRepository
                ? <GitFork aria-hidden="true" className="size-3.5" />
                : isDeployment
                  ? <Workflow aria-hidden="true" className="size-3.5" />
                  : <Server aria-hidden="true" className="size-3.5" />}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">{node?.data.title}</span>
              <span className="block text-[0.625rem] font-normal text-slate-500">
                {t("workflows.blueprint.nodeMenu")}
              </span>
            </span>
          </ContextMenu.Label>
          <ContextMenu.Item
            className="mt-1 flex cursor-default items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-red-300 outline-none transition-colors data-[highlighted]:bg-red-500/10 data-[disabled]:opacity-50"
            disabled={!node}
            onSelect={() => { if (node) onDelete(node); }}
          >
            <Trash2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <span className="block text-xs font-medium">
                {isStepNode
                  ? isDeployment
                    ? t("workflows.blueprint.deleteDeployment")
                    : t("workflows.blueprint.deleteRepository")
                  : t("workflows.blueprint.deleteCluster")}
              </span>
              <span className="mt-0.5 block text-[0.625rem] leading-4 text-slate-500">
                {isStepNode
                  ? isDeployment
                    ? t("workflows.blueprint.deleteDeploymentDescription")
                    : t("workflows.blueprint.deleteRepositoryDescription")
                  : t("workflows.blueprint.deleteClusterDescription")}
              </span>
            </span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
