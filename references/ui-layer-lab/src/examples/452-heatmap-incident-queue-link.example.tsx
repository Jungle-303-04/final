import { useState } from "react";

const values = [8, 19, 42, 77, 88, 95];

export default function HeatmapIncidentQueueLinkExample() {
  const [queue, setQueue] = useState("No queue opened");

  return (
    <div className="heatmap-demo">
      <div className="small-heatmap-grid">
        {values.map((value) => <button className={`heat-cell ${value > 75 ? "hot" : value > 40 ? "warm" : "cool"}`} key={value} onClick={() => setQueue(`${value} incident queue`)}>{value}</button>)}
      </div>
      <aside className="detail-panel">
        <strong>{queue}</strong>
        <span>Cell links to queue</span>
      </aside>
    </div>
  );
}
