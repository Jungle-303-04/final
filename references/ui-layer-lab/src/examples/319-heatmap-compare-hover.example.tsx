import { useState } from "react";

const current = [12, 34, 56, 78, 44, 68];
const previous = [18, 22, 42, 52, 50, 60];

export default function HeatmapCompareHoverExample() {
  const [mode, setMode] = useState<"current" | "previous">("current");
  const values = mode === "current" ? current : previous;

  return (
    <div className="threshold-heatmap">
      <button className="command-trigger" onClick={() => setMode((value) => (value === "current" ? "previous" : "current"))}>{mode}</button>
      <div className="small-heatmap-grid">
        {values.map((value) => <button className={`heat-cell ${value > 60 ? "hot" : value > 30 ? "warm" : "cool"}`} key={value}>{value}</button>)}
      </div>
    </div>
  );
}
