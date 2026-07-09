import { useState } from "react";

const tree = {
  workspace: ["frontend", "agent"],
  frontend: ["build", "visual-smoke"],
  agent: ["unit-test", "sync-test"],
  build: ["install", "typecheck"],
  "visual-smoke": ["open-page", "compare-shot"],
  "unit-test": ["parser", "scheduler"],
  "sync-test": ["fetch", "apply"]
};

export default function BreadcrumbDrilldownExample() {
  const [path, setPath] = useState(["workspace"]);
  const current = path[path.length - 1];
  const children = tree[current as keyof typeof tree] ?? [];

  return (
    <div className="breadcrumb-drill">
      <nav>
        {path.map((item, index) => (
          <button key={item} onClick={() => setPath(path.slice(0, index + 1))}>
            {item}
          </button>
        ))}
      </nav>
      <div className="drawer">
        <strong>{current}</strong>
        {children.map((child) => (
          <button className="row-button" key={child} onClick={() => setPath([...path, child])}>
            {child}
          </button>
        ))}
        {children.length === 0 ? <span className="muted">No deeper level.</span> : null}
      </div>
    </div>
  );
}
