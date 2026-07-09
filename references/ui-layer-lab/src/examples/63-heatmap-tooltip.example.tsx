import { useState } from "react";

const rows = ["api", "web", "agent"];
const columns = ["09", "10", "11", "12"];

export default function HeatmapTooltipExample() {
  const [hovered, setHovered] = useState("Hover a cell");

  return (
    <div className="heatmap-demo">
      <div className="heatmap-grid" style={{ gridTemplateColumns: `72px repeat(${columns.length}, 1fr)` }}>
        <span />
        {columns.map((column) => (
          <strong key={column}>{column}:00</strong>
        ))}
        {rows.map((row, rowIndex) => (
          <div className="heatmap-row" key={row}>
            <strong>{row}</strong>
            {columns.map((column, columnIndex) => {
              const value = (rowIndex * 29 + columnIndex * 23 + 21) % 100;
              return (
                <button
                  className={`heat-cell ${value > 70 ? "hot" : value > 40 ? "warm" : "cool"}`}
                  key={column}
                  onMouseEnter={() => setHovered(`${row} at ${column}:00 scored ${value}`)}
                >
                  {value}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>Cell detail</strong>
        <span>{hovered}</span>
      </aside>
    </div>
  );
}
