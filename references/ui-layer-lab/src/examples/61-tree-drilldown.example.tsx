import { useState } from "react";

const nodes = [
  { id: "workflow", parent: "", label: "Workflow run" },
  { id: "build", parent: "workflow", label: "Build job" },
  { id: "smoke", parent: "workflow", label: "Visual smoke job" },
  { id: "route", parent: "smoke", label: "Route check" },
  { id: "screenshot", parent: "smoke", label: "Screenshot diff" }
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
        <span>ID: {selected.id}</span>
      </aside>
    </div>
  );
}
