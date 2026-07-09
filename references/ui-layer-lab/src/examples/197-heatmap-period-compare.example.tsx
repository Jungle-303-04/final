import { useState } from "react";

const current = [18, 31, 72, 45, 66, 20, 84, 39, 55];
const previous = [14, 36, 49, 52, 61, 28, 70, 42, 47];

export default function HeatmapPeriodCompareExample() {
  const [mode, setMode] = useState<"current" | "delta">("current");
  const values = mode === "current" ? current : current.map((value, index) => value - previous[index]);

  return (
    <div className="threshold-heatmap">
      <button className="command-trigger" onClick={() => setMode((value) => (value === "current" ? "delta" : "current"))}>
        {mode === "current" ? "Show Delta" : "Show Current"}
      </button>
      <div className="small-heatmap-grid">
        {values.map((value, index) => {
          const score = Math.abs(value);
          return <button className={`heat-cell ${score > 24 ? "hot" : score > 12 ? "warm" : "cool"}`} key={index}>{value}</button>;
        })}
      </div>
    </div>
  );
}
