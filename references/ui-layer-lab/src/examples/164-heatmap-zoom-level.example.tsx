import { useState } from "react";

export default function HeatmapZoomLevelExample() {
  const [zoom, setZoom] = useState(3);
  const cells = Array.from({ length: zoom * zoom }, (_, index) => (index * 19 + 11) % 100);

  return (
    <div className="threshold-heatmap">
      <label>
        Zoom {zoom}x{zoom}
        <input type="range" min="2" max="6" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
      </label>
      <div className="zoom-heatmap" style={{ gridTemplateColumns: `repeat(${zoom}, minmax(0, 1fr))` }}>
        {cells.map((value, index) => (
          <button className={`heat-cell ${value > 70 ? "hot" : value > 40 ? "warm" : "cool"}`} key={index}>{value}</button>
        ))}
      </div>
    </div>
  );
}
