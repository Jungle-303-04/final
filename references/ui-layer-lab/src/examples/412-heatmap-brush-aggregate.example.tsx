import { useState } from "react";

const values = [12, 24, 38, 57, 73, 91];

export default function HeatmapBrushAggregateExample() {
  const [selected, setSelected] = useState([24, 57]);
  const total = selected.reduce((sum, value) => sum + value, 0);

  function toggle(value: number) {
    setSelected((items) => (items.includes(value) ? items.filter((item) => item !== value) : [...items, value]));
  }

  return (
    <div className="heatmap-demo">
      <div className="small-heatmap-grid">
        {values.map((value) => (
          <button className={`heat-cell ${value > 70 ? "hot" : value > 35 ? "warm" : "cool"}`} key={value} onClick={() => toggle(value)}>
            {selected.includes(value) ? "on" : value}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{selected.length} cells</strong>
        <span>{total} aggregate</span>
      </aside>
    </div>
  );
}
