import { useState } from "react";

const values = [14, 29, 44, 67, 79, 96];

export default function HeatmapSeverityLegendToggleExample() {
  const [hotOnly, setHotOnly] = useState(false);

  return (
    <div className="threshold-heatmap">
      <button className="command-trigger" onClick={() => setHotOnly((value) => !value)}>{hotOnly ? "Show All" : "Hot Only"}</button>
      <div className="small-heatmap-grid">
        {values.map((value) => (
          <button className={`heat-cell ${value > 75 ? "hot" : value > 40 ? "warm" : "cool"} ${hotOnly && value <= 75 ? "muted-row" : ""}`} key={value}>
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}
