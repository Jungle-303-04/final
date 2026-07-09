import { useState } from "react";

const runs = [
  { name: "preview", status: "failed" },
  { name: "api", status: "running" },
  { name: "worker", status: "success" }
];

export default function DrilldownStatusFiltersExample() {
  const [status, setStatus] = useState("all");
  const filtered = status === "all" ? runs : runs.filter((run) => run.status === status);

  return (
    <div className="drill-grid">
      <div className="drawer">
        <div className="segmented-row">
          {["all", "failed", "running", "success"].map((item) => (
            <button className={status === item ? "active" : ""} key={item} onClick={() => setStatus(item)}>
              {item}
            </button>
          ))}
        </div>
        {filtered.map((run) => (
          <button className="row-button" key={run.name}>
            {run.name}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{filtered.length} runs</strong>
        <span>Filtered by {status}</span>
      </aside>
    </div>
  );
}
