import { useState } from "react";

const values = [12, 28, 35, 44, 59, 63, 75, 81, 92, 48, 31, 17];

export default function HeatmapWindowBrushExample() {
  const [start, setStart] = useState(2);
  const [selected, setSelected] = useState<number | null>(null);
  const windowValues = values.slice(start, start + 6);

  return (
    <div className="threshold-heatmap">
      <label>
        보기 구간 {start + 1}-{start + 6}
        <input aria-label="히트맵 보기 구간" type="range" min="0" max="6" value={start} onChange={(event) => setStart(Number(event.target.value))} />
      </label>
      <div className="small-heatmap-grid">
        {windowValues.map((value) => (
          <button
            aria-label={`구간 값 ${value} 선택`}
            aria-pressed={selected === value}
            className={`heat-cell ${value > 70 ? "hot" : value > 40 ? "warm" : "cool"} ${selected === value ? "selected" : ""}`}
            key={value}
            onClick={() => setSelected(value)}
            type="button"
          >
            {value}
          </button>
        ))}
      </div>
      <strong aria-live="polite">선택 값: {selected ?? "없음"}</strong>
    </div>
  );
}
