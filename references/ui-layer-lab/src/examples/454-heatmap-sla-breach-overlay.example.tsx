import { useState } from "react";

const values = [23, 37, 55, 71, 84, 97];

export default function HeatmapSlaBreachOverlayExample() {
  const [breachOnly, setBreachOnly] = useState(false);

  return (
    <div className="threshold-heatmap">
      <button className="command-trigger" onClick={() => setBreachOnly((value) => !value)}>{breachOnly ? "Show All" : "SLA Breach"}</button>
      <div className="small-heatmap-grid">
        {values.map((value) => <button className={`heat-cell ${value > 80 ? "hot" : value > 50 ? "warm" : "cool"} ${breachOnly && value <= 80 ? "muted-row" : ""}`} key={value}>{value}</button>)}
      </div>
    </div>
  );
}
