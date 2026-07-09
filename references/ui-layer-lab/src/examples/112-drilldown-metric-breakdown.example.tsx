import { useState } from "react";

const metrics = [
  { name: "API", value: 82, detail: "Latency rose after deploy." },
  { name: "Web", value: 43, detail: "Stable route checks." },
  { name: "Worker", value: 67, detail: "Queue is draining slowly." }
];

export default function DrilldownMetricBreakdownExample() {
  const [selected, setSelected] = useState(metrics[0]);

  return (
    <div className="table-drill">
      <div className="metric-bars">
        {metrics.map((metric) => (
          <button className={metric.name === selected.name ? "active" : ""} key={metric.name} onClick={() => setSelected(metric)}>
            <span>{metric.name}</span>
            <div className="progress-track">
              <div style={{ width: `${metric.value}%` }} />
            </div>
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{selected.name}</strong>
        <span>{selected.detail}</span>
      </aside>
    </div>
  );
}
