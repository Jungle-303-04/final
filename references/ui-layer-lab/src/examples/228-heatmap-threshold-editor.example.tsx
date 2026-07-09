import { useState } from "react";

const values = [8, 21, 45, 64, 78, 88, 32, 15, 53];

export default function HeatmapThresholdEditorExample() {
  const [threshold, setThreshold] = useState(60);

  return (
    <div className="threshold-heatmap">
      <label>
        Hot threshold {threshold}
        <input type="range" min="20" max="90" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
      </label>
      <div className="small-heatmap-grid">
        {values.map((value) => <button className={`heat-cell ${value >= threshold ? "hot" : value > 35 ? "warm" : "cool"}`} key={value}>{value}</button>)}
      </div>
    </div>
  );
}
