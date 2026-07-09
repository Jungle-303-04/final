import { useState } from "react";

const incidents = [11, 36, 49, 72, 86, 94];

export default function HeatmapDetailDrawerExample() {
  const [value, setValue] = useState(86);

  return (
    <div className="heatmap-demo">
      <div className="small-heatmap-grid">
        {incidents.map((item) => (
          <button className={`heat-cell ${item > 80 ? "hot" : item > 40 ? "warm" : "cool"}`} key={item} onClick={() => setValue(item)}>
            {item}
          </button>
        ))}
      </div>
      <aside className="floating-drawer">
        <strong>{value}</strong>
        <span>{value > 80 ? "Open incident drawer" : "Low severity"}</span>
      </aside>
    </div>
  );
}
