const cells = Array.from({ length: 20 }, (_, index) => ({
  value: (index * 29 + 8) % 100,
  anomaly: index === 7 || index === 16
}));

export default function HeatmapAnomalyOverlayExample() {
  return (
    <div className="small-heatmap-grid anomaly-grid">
      {cells.map((cell, index) => (
        <button className={`heat-cell ${cell.value > 70 ? "hot" : cell.value > 40 ? "warm" : "cool"} ${cell.anomaly ? "anomaly" : ""}`} key={index}>
          {cell.value}
        </button>
      ))}
    </div>
  );
}
