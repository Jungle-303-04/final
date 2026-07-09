import { useState } from "react";

const services = ["console", "agent", "gitops", "gateway"];
const days = ["Mon", "Tue", "Wed", "Thu"];

export default function HeatmapBrushExample() {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(key: string) {
    setSelected((items) => (items.includes(key) ? items.filter((item) => item !== key) : [...items, key]));
  }

  return (
    <div className="heatmap-brush">
      <div className="heatmap-grid" style={{ gridTemplateColumns: `96px repeat(${days.length}, 1fr)` }}>
        <span />
        {days.map((day) => (
          <strong key={day}>{day}</strong>
        ))}
        {services.map((service, row) => (
          <div className="heatmap-row" key={service}>
            <strong>{service}</strong>
            {days.map((day, column) => {
              const key = `${service}-${day}`;
              const value = (row * 31 + column * 19 + 13) % 100;
              return (
                <button
                  className={`heat-cell ${value > 70 ? "hot" : value > 40 ? "warm" : "cool"} ${
                    selected.includes(key) ? "selected" : ""
                  }`}
                  key={key}
                  onClick={() => toggle(key)}
                >
                  {value}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <span className="brush-count">{selected.length} selected</span>
    </div>
  );
}
