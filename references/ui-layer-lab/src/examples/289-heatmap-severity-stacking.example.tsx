import { useState } from "react";

const values = [5, 12, 24, 39, 45, 61, 72, 88, 96];

export default function HeatmapSeverityStackingExample() {
  const [severity, setSeverity] = useState(50);
  const selectedCount = values.filter((value) => value >= severity).length;

  return (
    <div className="threshold-heatmap">
      <label>
        <span aria-live="polite">심각도 {severity} 이상 표시</span>
        <input aria-label="히트맵 심각도 임계값" type="range" min="10" max="90" value={severity} onChange={(event) => setSeverity(Number(event.target.value))} />
      </label>
      <div className="small-heatmap-grid">
        {values.map((value) => (
          <button
            aria-label={`심각도 값 ${value}, ${value >= severity ? "임계 이상" : "임계 미만"}`}
            aria-pressed={value >= severity}
            className={`heat-cell value-sized ${value >= severity ? "hot selected" : value > 30 ? "warm" : "cool"}`}
            key={value}
            style={{ minHeight: `${46 + value}px` }}
            type="button"
          >
            {value}
          </button>
        ))}
      </div>
      <span aria-live="polite" className="brush-count">임계 이상 {selectedCount}개</span>
    </div>
  );
}
