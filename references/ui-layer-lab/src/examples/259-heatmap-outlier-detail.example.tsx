import { useState } from "react";

const values = [21, 18, 90, 24, 31, 88, 17, 29, 44];

export default function HeatmapOutlierDetailExample() {
  const [value, setValue] = useState(90);

  return (
    <div className="heatmap-demo">
      <div className="small-heatmap-grid">
        {values.map((item) => (
          <button
            aria-label={`${item} 값 선택`}
            aria-pressed={value === item}
            className={`heat-cell ${item > 80 ? "hot" : item > 35 ? "warm" : "cool"} ${value === item ? "selected" : ""}`}
            key={item}
            onClick={() => setValue(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong aria-live="polite">{value > 80 ? "이상치" : "정상"}</strong>
        <span>값 {value}</span>
      </aside>
    </div>
  );
}
