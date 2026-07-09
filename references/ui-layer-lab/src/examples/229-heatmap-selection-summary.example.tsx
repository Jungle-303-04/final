import { useState } from "react";

const cells = [11, 24, 37, 50, 63, 76, 89, 42, 18];

export default function HeatmapSelectionSummaryExample() {
  const [selected, setSelected] = useState([76]);

  return (
    <div className="heatmap-demo">
      <div className="small-heatmap-grid">
        {cells.map((value) => (
          <button className={`heat-cell ${selected.includes(value) ? "selected" : value > 60 ? "hot" : value > 35 ? "warm" : "cool"}`} key={value} onClick={() => setSelected((items) => (items.includes(value) ? items.filter((item) => item !== value) : [...items, value]))}>
            {value}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{selected.length} selected</strong>
        <span>Total {selected.reduce((sum, value) => sum + value, 0)}</span>
      </aside>
    </div>
  );
}
