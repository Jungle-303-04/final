import { useState } from "react";

const nodes = [
  { id: "workflow", parent: "", label: "워크플로 실행" },
  { id: "build", parent: "workflow", label: "빌드 작업" },
  { id: "smoke", parent: "workflow", label: "시각 스모크 작업" },
  { id: "route", parent: "smoke", label: "라우트 검사" },
  { id: "screenshot", parent: "smoke", label: "스크린샷 차이" }
];

export default function TreeDrilldownExample() {
  const [expanded, setExpanded] = useState(["workflow", "smoke"]);
  const [selected, setSelected] = useState(nodes[0]);

  function toggle(id: string) {
    setExpanded((items) => (items.includes(id) ? items.filter((item) => item !== id) : [...items, id]));
  }

  function render(parent: string, depth = 0) {
    return nodes
      .filter((node) => node.parent === parent)
      .map((node) => {
        const children = nodes.some((item) => item.parent === node.id);
        const open = expanded.includes(node.id);

        return (
          <div key={node.id}>
            <button
              className={`tree-row ${selected.id === node.id ? "active" : ""}`}
              style={{ paddingLeft: 14 + depth * 18 }}
              onClick={() => {
                setSelected(node);
                if (children) toggle(node.id);
              }}
              type="button"
            >
              {children ? (open ? "-" : "+") : "·"} {node.label}
            </button>
            {open ? render(node.id, depth + 1) : null}
          </div>
        );
      });
  }

  return (
    <div className="drill-grid two">
      <div className="tree-panel">{render("")}</div>
      <aside className="detail-panel">
        <strong>{selected.label}</strong>
        <span>식별자: {selected.id}</span>
      </aside>
    </div>
  );
}
