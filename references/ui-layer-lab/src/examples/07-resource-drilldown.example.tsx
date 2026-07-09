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
  status: "경고",
  children: [
    {
      id: "namespace",
      label: "console",
      status: "실패",
      children: [
        {
          id: "deploy",
          label: "deploy/frontend",
          status: "실패",
          children: [{ id: "pod", label: "frontend-8af21", status: "재시작 반복" }]
        }
      ]
    }
  ]
};

export default function ResourceDrilldownExample() {
  const nodes = useMemo(() => flatten(tree), []);
  const [selectedId, setSelectedId] = useState("pod");
  const selected = nodes.find((nodes) => nodes.id === selectedId) ?? nodes[0];

  return (
    <div className="drill-grid two">
      <div>
        <h3>리소스</h3>
        <TreeNode nodes={tree} selectedId={selected.id} onSelect={setSelectedId} depth={0} />
      </div>
      <div className="detail-panel">
        <strong>{selected.label}</strong>
        <span>상태: {selected.status}</span>
        <span>소유 경로: prod-cluster / console / frontend</span>
      </div>
    </div>
  );
}

function TreeNode({
  nodes,
  selectedId,
  onSelect,
  depth
}: {
  nodes: Node;
  selectedId: string;
  onSelect: (id: string) => void;
  depth: number;
}) {
  return (
    <>
      <button
        className={nodes.id === selectedId ? "selected row-button" : "row-button"}
        style={{ paddingLeft: 12 + depth * 18 }}
        onClick={() => onSelect(nodes.id)}
        type="button"
      >
        {nodes.label}
      </button>
      {nodes.children?.map((child) => (
        <TreeNode key={child.id} nodes={child} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
      ))}
    </>
  );
}

function flatten(nodes: Node): Node[] {
  return [nodes, ...(nodes.children ?? []).flatMap(flatten)];
}
