import { useState } from "react";

const values = [21, 18, 90, 24, 31, 88, 17, 29, 44];

export default function HeatmapOutlierDetailExample() {
  const [value, setValue] = useState(90);

  return (
    <div className="heatmap-demo">
      <div className="small-heatmap-grid">
        {values.map((item) => <button className={`heat-cell ${item > 80 ? "hot" : item > 35 ? "warm" : "cool"}`} key={item} onClick={() => setValue(item)}>{item}</button>)}
      </div>
      <aside className="detail-panel">
        <strong>{value > 80 ? "Outlier" : "Normal"}</strong>
        <span>Value {value}</span>
      </aside>
    </div>
  );
}
