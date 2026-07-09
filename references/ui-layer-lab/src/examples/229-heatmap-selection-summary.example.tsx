import { useState } from "react";

const cells = [11, 24, 37, 50, 63, 76, 89, 42, 18];

export default function HeatmapSelectionSummaryExample() {
  const [selected, setSelected] = useState([76]);

  return (
    <div className="heatmap-demo">
      <div className="small-heatmap-grid">
        {cells.map((value) => (
          <button
            aria-label={`값 ${value}`}
            aria-pressed={selected.includes(value)}
            className={`heat-cell ${selected.includes(value) ? "selected" : value > 60 ? "hot" : value > 35 ? "warm" : "cool"}`}
            key={value}
            onClick={() => setSelected((items) => (items.includes(value) ? items.filter((item) => item !== value) : [...items, value]))}
            type="button"
          >
            {value}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>선택 {selected.length}개</strong>
        <span>합계 {selected.reduce((sum, value) => sum + value, 0)}</span>
      </aside>
    </div>
  );
}
