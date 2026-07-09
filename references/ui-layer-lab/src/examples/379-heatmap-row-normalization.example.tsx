import { useState } from "react";

const raw = [8, 16, 24, 48, 64, 80];

export default function HeatmapRowNormalizationExample() {
  const [normalized, setNormalized] = useState(false);
  const values = normalized ? raw.map((value) => Math.round((value / 80) * 100)) : raw;

  return (
    <div className="threshold-heatmap">
      <button className="command-trigger" onClick={() => setNormalized((value) => !value)}>{normalized ? "Raw" : "Normalize"}</button>
      <div className="small-heatmap-grid">
        {values.map((value) => <button className={`heat-cell ${value > 70 ? "hot" : value > 35 ? "warm" : "cool"}`} key={value}>{value}</button>)}
      </div>
    </div>
  );
}
