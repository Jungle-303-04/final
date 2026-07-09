import { useState } from "react";

const paths = {
  "run.status": "failed",
  "run.jobs[0].name": "build",
  "run.jobs[0].steps[2]": "bundle"
};

export default function DrilldownNestedJsonPathExample() {
  const [path, setPath] = useState<keyof typeof paths>("run.status");

  return (
    <div className="drill-grid two">
      <div className="drawer">
        {Object.keys(paths).map((item) => (
          <button className={path === item ? "row-button selected" : "row-button"} key={item} onClick={() => setPath(item as keyof typeof paths)}>
            {item}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{path}</strong>
        <code>{paths[path]}</code>
      </aside>
    </div>
  );
}
