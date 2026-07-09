import { useState } from "react";

const values = [18, 33, 45, 69, 82, 95];

export default function HeatmapRovingFocusDetailExample() {
  const [index, setIndex] = useState(0);
  const value = values[index];

  return (
    <div className="heatmap-demo">
      <div className="small-heatmap-grid" onKeyDown={(event) => {
        if (event.key === "ArrowRight") setIndex((current) => Math.min(values.length - 1, current + 1));
        if (event.key === "ArrowLeft") setIndex((current) => Math.max(0, current - 1));
      }}>
        {values.map((item, itemIndex) => (
          <button autoFocus={itemIndex === index} className={`heat-cell ${item > 70 ? "hot" : item > 40 ? "warm" : "cool"}`} key={item} onClick={() => setIndex(itemIndex)}>
            {itemIndex === index ? "focus" : item}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{value}</strong>
        <span>Roving focus cell</span>
      </aside>
    </div>
  );
}
