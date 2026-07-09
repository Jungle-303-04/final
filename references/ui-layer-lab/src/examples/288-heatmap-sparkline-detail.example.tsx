import { useState } from "react";

const rows = [
  { id: "api", label: "API 서비스", values: [12, 18, 44, 39] },
  { id: "web", label: "웹 화면", values: [33, 51, 69, 72] },
  { id: "jobs", label: "작업 큐", values: [22, 28, 31, 47] }
];

export default function HeatmapSparklineDetailExample() {
  const [row, setRow] = useState(rows[1].id);
  const selected = rows.find((item) => item.id === row) ?? rows[0];
  const selectedPeak = Math.max(...selected.values);

  return (
    <div className="heatmap-demo">
      <div className="small-heatmap-grid">
        {rows.map((item) => {
          const peak = Math.max(...item.values);
          const span = Math.max(2, Math.min(6, Math.round(peak / 14)));

          return (
            <button
              aria-label={`${item.label} 행 선택, 최고 값 ${peak}`}
              aria-pressed={row === item.id}
              className={`heat-cell value-sized warm ${row === item.id ? "selected" : ""}`}
              key={item.id}
              onClick={() => setRow(item.id)}
              style={{ gridColumn: `span ${span}`, minHeight: `${68 + peak}px` }}
              type="button"
            >
              <strong>{item.label}</strong>
              <span>{peak}</span>
              <span aria-hidden="true" className="heat-sparkline">
                {item.values.map((value) => <i key={value} style={{ height: `${Math.max(8, value / 2)}px` }} />)}
              </span>
            </button>
          );
        })}
      </div>
      <aside aria-live="polite" className="detail-panel">
        <strong>{selected.label}</strong>
        <span>최고 값 {selectedPeak}</span>
        <span>{selected.values.join(" -> ")}</span>
      </aside>
    </div>
  );
}
