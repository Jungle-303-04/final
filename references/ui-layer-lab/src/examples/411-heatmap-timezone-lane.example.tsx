import { useState } from "react";

const cells = [
  { zone: "KST", value: 24 },
  { zone: "UTC", value: 62 },
  { zone: "PST", value: 88 },
  { zone: "EST", value: 41 }
];

export default function HeatmapTimezoneLaneExample() {
  const [cell, setCell] = useState(cells[0]);

  return (
    <div className="heatmap-demo">
      <div className="small-heatmap-grid">
        {cells.map((item) => (
          <button className={`heat-cell ${item.value > 70 ? "hot" : item.value > 40 ? "warm" : "cool"}`} key={item.zone} onClick={() => setCell(item)}>
            {item.zone}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{cell.zone}</strong>
        <span>{cell.value} incidents</span>
      </aside>
    </div>
  );
}
