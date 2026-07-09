import { useState } from "react";

const rows = {
  API: [12, 28, 44, 60],
  Web: [8, 18, 72, 36],
  Jobs: [4, 30, 52, 88]
};

export default function HeatmapHourlyLaneExample() {
  const [cell, setCell] = useState("API 44");

  return (
    <div className="heatmap-demo">
      <div className="hour-lane-grid">
        {Object.entries(rows).map(([row, values]) => (
          <div className="hour-lane-row" key={row}>
            <strong>{row}</strong>
            {values.map((value) => <button className={`heat-cell ${value > 70 ? "hot" : value > 30 ? "warm" : "cool"}`} key={value} onClick={() => setCell(`${row} ${value}`)}>{value}</button>)}
          </div>
        ))}
      </div>
      <aside className="detail-panel"><strong>{cell}</strong><span>Hourly lane selected</span></aside>
    </div>
  );
}
