import { useState } from "react";

const values = Array.from({ length: 24 }, (_, index) => (index * 37 + 11) % 100);

export default function HeatmapThresholdFilterExample() {
  const [threshold, setThreshold] = useState(60);

  return (
    <div className="threshold-heatmap">
      <label>
        Threshold {threshold}
        <input type="range" min="0" max="100" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
      </label>
      <div className="small-heatmap-grid">
        {values.map((value, index) => (
          <button className={`heat-cell ${value >= threshold ? "hot" : value > 40 ? "warm" : "cool"}`} key={index}>
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}
