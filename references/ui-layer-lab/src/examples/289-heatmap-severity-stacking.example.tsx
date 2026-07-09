import { useState } from "react";

const values = [5, 12, 24, 39, 45, 61, 72, 88, 96];

export default function HeatmapSeverityStackingExample() {
  const [severity, setSeverity] = useState(50);

  return (
    <div className="threshold-heatmap">
      <label>
        Severity {severity}+
        <input type="range" min="10" max="90" value={severity} onChange={(event) => setSeverity(Number(event.target.value))} />
      </label>
      <div className="small-heatmap-grid">
        {values.map((value) => <button className={`heat-cell ${value >= severity ? "hot" : value > 30 ? "warm" : "cool"}`} key={value}>{value}</button>)}
      </div>
    </div>
  );
}
