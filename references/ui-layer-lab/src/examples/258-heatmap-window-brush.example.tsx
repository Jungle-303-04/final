import { useState } from "react";

const values = [12, 28, 35, 44, 59, 63, 75, 81, 92, 48, 31, 17];

export default function HeatmapWindowBrushExample() {
  const [start, setStart] = useState(2);
  const windowValues = values.slice(start, start + 6);

  return (
    <div className="threshold-heatmap">
      <label>
        Window {start + 1}-{start + 6}
        <input type="range" min="0" max="6" value={start} onChange={(event) => setStart(Number(event.target.value))} />
      </label>
      <div className="small-heatmap-grid">
        {windowValues.map((value) => <button className={`heat-cell ${value > 70 ? "hot" : value > 40 ? "warm" : "cool"}`} key={value}>{value}</button>)}
      </div>
    </div>
  );
}
