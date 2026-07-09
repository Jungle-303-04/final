import { useState } from "react";
const services = ["console", "agent", "gitops", "gateway"];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function HeatmapDrilldownExample() {
  const [selected, setSelected] = useState({ service: "console", day: "Fri", value: 89 });

  return (
    <div className="heatmap-demo">
      <div className="heatmap-grid" style={{ gridTemplateColumns: `96px repeat(${days.length}, 1fr)` }}>
        <span />
        {days.map((day) => (
          <strong key={day}>{day}</strong>
        ))}
        {services.map((service, row) => (
          <div className="heatmap-row" key={service}>
            <strong>{service}</strong>
            {days.map((day, col) => {
              const value = (row * 29 + col * 17 + 21) % 100;
              return (
                <button
                  className={`heat-cell ${value > 70 ? "hot" : value > 40 ? "warm" : "cool"}`}
                  key={day}
                  onClick={() => setSelected({ service, day, value })}
                >
                  {value}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="detail-panel">
        <strong>
          {selected.service} / {selected.day}
        </strong>
        <span>Risk score: {selected.value}</span>
        <span>Open logs filtered by this cell.</span>
      </div>
    </div>
  );
}
