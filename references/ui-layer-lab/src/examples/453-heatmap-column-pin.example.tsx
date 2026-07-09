import { useState } from "react";

const columns = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function HeatmapColumnPinExample() {
  const [column, setColumn] = useState("Wed");

  return (
    <div className="calendar-heatmap">
      <div className="small-heatmap-grid">
        {columns.map((item, index) => <button className={`heat-cell ${index > 3 ? "hot" : index > 1 ? "warm" : "cool"}`} key={item} onClick={() => setColumn(item)}>{item}</button>)}
      </div>
      <strong>{column} pinned</strong>
    </div>
  );
}
