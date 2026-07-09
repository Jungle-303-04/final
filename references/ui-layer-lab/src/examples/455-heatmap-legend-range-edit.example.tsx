import { useState } from "react";

export default function HeatmapLegendRangeEditExample() {
  const [threshold, setThreshold] = useState(70);
  const values = [25, 44, 61, 72, 86, 94];

  return (
    <div className="threshold-heatmap">
      <label>
        Hot threshold {threshold}
        <input max={95} min={40} onChange={(event) => setThreshold(Number(event.target.value))} type="range" value={threshold} />
      </label>
      <div className="small-heatmap-grid">
        {values.map((value) => <button className={`heat-cell ${value >= threshold ? "hot" : value > 45 ? "warm" : "cool"}`} key={value}>{value}</button>)}
      </div>
    </div>
  );
}
