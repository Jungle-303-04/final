import { Trash2 } from "lucide-react";
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

  return (
    <ContextMenu.Root modal={false} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label={t("workflows.blueprint.deleteNode")}
          className="z-[100] w-40 overflow-hidden rounded-xl border border-black/10 bg-white p-1.5 font-sans shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
        >
          <ContextMenu.Item
            className="flex cursor-default items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-600 outline-none transition-colors data-[highlighted]:bg-red-50 data-[disabled]:opacity-50"
            disabled={!node}
            onSelect={() => { if (node) onDelete(node); }}
          >
            <Trash2 aria-hidden="true" className="size-4 shrink-0" />
            <span>{t("workflows.blueprint.deleteNode")}</span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
