import { useState } from "react";

const values = Array.from({ length: 36 }, (_, index) => (index * 13 + 17) % 100);

export default function HeatmapRangeScrubberExample() {
  const [windowStart, setWindowStart] = useState(0);
  const visible = values.slice(windowStart, windowStart + 12);

  return (
    <div className="threshold-heatmap">
      <label>
        Window {windowStart + 1}-{windowStart + visible.length}
        <input type="range" min="0" max="24" value={windowStart} onChange={(event) => setWindowStart(Number(event.target.value))} />
      </label>
      <div className="small-heatmap-grid">
        {visible.map((value, index) => (
          <button className={`heat-cell ${value > 70 ? "hot" : value > 40 ? "warm" : "cool"}`} key={`${windowStart}-${index}`}>
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}
