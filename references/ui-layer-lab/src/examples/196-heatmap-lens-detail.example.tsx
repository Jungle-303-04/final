import { useState } from "react";

const values = Array.from({ length: 16 }, (_, index) => (index * 17 + 13) % 100);

export default function HeatmapLensDetailExample() {
  const [value, setValue] = useState(values[0]);

  return (
    <div className="heatmap-demo">
      <div className="small-heatmap-grid">
        {values.map((item, index) => (
          <button className={`heat-cell ${item > 70 ? "hot" : item > 40 ? "warm" : "cool"}`} key={index} onMouseEnter={() => setValue(item)}>
            {item}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>Cell detail</strong>
        <span>Load {value}%</span>
        <span>{value > 70 ? "Hot path" : "Normal range"}</span>
      </aside>
    </div>
  );
}
