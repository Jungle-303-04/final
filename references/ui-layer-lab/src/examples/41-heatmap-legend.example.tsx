const values = [8, 22, 41, 63, 88];

export default function HeatmapLegendExample() {
  return (
    <div className="legend-heatmap">
      <div className="legend-row">
        {values.map((value) => (
          <button className={`heat-cell ${value > 70 ? "hot" : value > 40 ? "warm" : "cool"}`} key={value}>
            {value}
          </button>
        ))}
      </div>
      <div className="legend-scale">
        <span>low</span>
        <span>medium</span>
        <span>high</span>
      </div>
    </div>
  );
}
