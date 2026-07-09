import { useMemo, useState } from "react";
type Node = {
  id: string;
  label: string;
  status: string;
  children?: Node[];
};

const tree: Node = {
  id: "cluster",
  label: "prod-cluster",
  status: "warning",
  children: [
    {
      id: "namespace",
      label: "console",
      status: "failed",
      children: [
        {
          id: "deploy",
          label: "deploy/frontend",
          status: "failed",
          children: [{ id: "pod", label: "frontend-8af21", status: "crashloop" }]
        }
      ]
    }
  ]
};

export default function ResourceDrilldownExample() {
  const nodes = useMemo(() => flatten(tree), []);
  const [selectedId, setSelectedId] = useState("pod");
  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];

  return (
    <div className="drill-grid two">
      <div>
        <h3>Resources</h3>
        <TreeNode node={tree} selectedId={selected.id} onSelect={setSelectedId} depth={0} />
      </div>
      <div className="detail-panel">
        <strong>{selected.label}</strong>
        <span>Status: {selected.status}</span>
        <span>Owner path: prod-cluster / console / frontend</span>
      </div>
    </div>
  );
}

function TreeNode({
  node,
  selectedId,
  onSelect,
  depth
}: {
  node: Node;
  selectedId: string;
  onSelect: (id: string) => void;
  depth: number;
}) {
  return (
    <>
      <button
        className={node.id === selectedId ? "selected row-button" : "row-button"}
        style={{ paddingLeft: 12 + depth * 18 }}
        onClick={() => onSelect(node.id)}
      >
        {node.label}
      </button>
      {node.children?.map((child) => (
        <TreeNode key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
      ))}
    </>
  );
}

function flatten(node: Node): Node[] {
  return [node, ...(node.children ?? []).flatMap(flatten)];
}
