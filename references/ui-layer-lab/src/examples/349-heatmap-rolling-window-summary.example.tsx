import { useState } from "react";

const windows = [
  { label: "1h", values: [12, 18, 40, 62] },
  { label: "6h", values: [30, 48, 56, 70] },
  { label: "24h", values: [8, 22, 44, 88] }
];

export default function HeatmapRollingWindowSummaryExample() {
  const [windowIndex, setWindowIndex] = useState(0);
  const active = windows[windowIndex];

  return (
    <div className="threshold-heatmap">
      <button className="command-trigger" onClick={() => setWindowIndex((value) => (value + 1) % windows.length)}>{active.label} window</button>
      <div className="small-heatmap-grid">
        {active.values.map((value) => <button className={`heat-cell ${value > 70 ? "hot" : value > 35 ? "warm" : "cool"}`} key={value}>{value}</button>)}
      </div>
    </div>
  );
}
