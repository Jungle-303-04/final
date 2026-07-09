import { useState } from "react";

const values = [12, 28, 46, 91, 34, 58];

export default function HeatmapCellAnnotationExample() {
  const [value, setValue] = useState(91);

  return (
    <div className="heatmap-demo">
      <div className="small-heatmap-grid">
        {values.map((item) => <button className={`heat-cell ${item > 80 ? "hot" : item > 40 ? "warm" : "cool"}`} key={item} onClick={() => setValue(item)}>{item}</button>)}
      </div>
      <aside className="detail-panel">
        <strong>{value}</strong>
        <span>{value > 80 ? "Annotated incident" : "No annotation"}</span>
      </aside>
    </div>
  );
}
