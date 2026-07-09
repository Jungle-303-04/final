import { useState } from "react";

const rows = {
  API: [12, 18, 44, 39],
  Web: [33, 51, 69, 72],
  Jobs: [22, 28, 31, 47]
};

export default function HeatmapSparklineDetailExample() {
  const [row, setRow] = useState<keyof typeof rows>("Web");

  return (
    <div className="heatmap-demo">
      <div className="small-heatmap-grid">
        {Object.entries(rows).map(([key, values]) => <button className="heat-cell warm" key={key} onClick={() => setRow(key as keyof typeof rows)}>{key}</button>)}
      </div>
      <aside className="detail-panel">
        <strong>{row}</strong>
        <span>{rows[row].join(" → ")}</span>
      </aside>
    </div>
  );
}
