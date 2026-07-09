import { useState } from "react";

const services = ["api", "web", "worker"];
const hours = ["09", "10", "11", "12"];

export default function HeatmapRowColumnSelectExample() {
  const [row, setRow] = useState("api");
  const [column, setColumn] = useState("10");

  return (
    <div className="heatmap-demo">
      <div className="heatmap-grid" style={{ gridTemplateColumns: `72px repeat(${hours.length}, 1fr)` }}>
        <span />
        {hours.map((hour) => (
          <button className="axis-button" key={hour} onClick={() => setColumn(hour)}>
            {hour}
          </button>
        ))}
        {services.map((service, rowIndex) => (
          <div className="heatmap-row" key={service}>
            <button className="axis-button" onClick={() => setRow(service)}>
              {service}
            </button>
            {hours.map((hour, columnIndex) => {
              const selected = row === service || column === hour;
              const value = (rowIndex * 27 + columnIndex * 31 + 14) % 100;
              return (
                <button className={`heat-cell ${value > 70 ? "hot" : value > 40 ? "warm" : "cool"} ${selected ? "selected" : ""}`} key={hour}>
                  {value}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{row} / {column}:00</strong>
        <span>Row and column are both highlighted.</span>
      </aside>
    </div>
  );
}
