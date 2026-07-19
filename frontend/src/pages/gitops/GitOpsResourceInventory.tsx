import { ArrowUpRight } from "lucide-react";

import type { GitOpsResourceTree } from "../../features/gitops/gitOpsContract";
import { useI18n } from "../../shared/i18n";
import { Surface } from "../../shared/ui/Surface";
import { Button } from "../../shared/ui/primitives/button";

export function GitOpsResourceInventory({
  onInspect,
  onToggle,
  selectedNodeIds,
  tree,
}: {
  onInspect: (node: GitOpsResourceTree["nodes"][number]) => void;
  onToggle: (nodeId: string, selected: boolean) => void;
  selectedNodeIds: ReadonlySet<string>;
  tree: GitOpsResourceTree;
}) {
  const { t } = useI18n();
  return (
    <Surface aria-labelledby="gitops-resource-tree-title" as="section" className="min-w-0 overflow-hidden p-0">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-3 py-2.5">
        <h4 className="text-label font-bold" id="gitops-resource-tree-title">{t("workflows.resource.tree")}</h4>
        <span className="font-mono text-caption text-caption-foreground">
          {t("workflows.resource.nodeCount", { count: tree.coverage.returnedCount })}
        </span>
      </header>
      {tree.coverage.state === "partial" ? (
        <p className="m-0 border-b border-tint-warn-border bg-tint-warn-bg px-3 py-2 text-caption-2 text-tint-warn-fg">
          {t("workflows.resource.treePartial")}
          {tree.coverage.reasonCodes.length ? ` · ${tree.coverage.reasonCodes.join(", ")}` : ""}
        </p>
      ) : null}
      <ul className="m-0 grid list-none divide-y divide-border-subtle p-0">
        {tree.nodes.map((node) => (
          <li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2" key={node.id}>
            {node.role === "root" ? <span className="size-4" /> : (
              <input
                aria-label={t("workflows.resource.selectNode", { name: node.resource.name })}
                checked={selectedNodeIds.has(node.id)}
                className="size-4 accent-primary"
                onChange={(event) => onToggle(node.id, event.target.checked)}
                type="checkbox"
              />
            )}
            <span className="grid min-w-0 gap-0.5">
              <strong className="truncate text-label-2">
                {node.resource.kind} · {node.resource.name}
              </strong>
              <span className="truncate font-mono text-caption text-caption-foreground">
                {[node.resource.namespace, node.role, node.status, node.health].filter(Boolean).join(" · ")}
              </span>
            </span>
            {canInspect(node) ? (
              <Button
                aria-label={t("workflows.resource.openNode", { name: node.resource.name })}
                onClick={() => onInspect(node)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ArrowUpRight aria-hidden="true" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {tree.edges.length ? (
        <ul className="m-0 grid list-none gap-1 border-t border-border-subtle bg-background-subtle px-3 py-2 font-mono text-caption text-caption-foreground">
          {tree.edges.map((edge) => (
            <li className="truncate" key={`${edge.source}:${edge.target}:${edge.relationship}`}>
              {edge.source} → {edge.target} · {edge.relationship}
            </li>
          ))}
        </ul>
      ) : null}
    </Surface>
  );
}

const INSPECTABLE_IDENTITIES = new Set([
  "argoproj.io/application",
  "kustomize.toolkit.fluxcd.io/kustomization",
  "helm.toolkit.fluxcd.io/helmrelease",
  "source.toolkit.fluxcd.io/gitrepository",
  "source.toolkit.fluxcd.io/ocirepository",
  "source.toolkit.fluxcd.io/helmrepository",
  "source.toolkit.fluxcd.io/bucket",
  "source.toolkit.fluxcd.io/helmchart",
]);

function canInspect(node: GitOpsResourceTree["nodes"][number]): boolean {
  return node.role !== "root"
    && node.resource.namespace !== null
    && INSPECTABLE_IDENTITIES.has(`${node.resource.apiGroup}/${node.resource.kind.toLowerCase()}`);
}
