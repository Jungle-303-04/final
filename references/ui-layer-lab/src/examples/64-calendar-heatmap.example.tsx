import { useState } from "react";

const days = Array.from({ length: 35 }, (_, index) => ({
  day: index + 1,
  value: (index * 17 + 9) % 100
}));

export default function CalendarHeatmapExample() {
  const [selected, setSelected] = useState(days[0]);

  return (
    <div className="calendar-heatmap">
      <div className="calendar-grid">
        {days.map((item) => (
          <button
            className={`heat-cell ${item.value > 70 ? "hot" : item.value > 40 ? "warm" : "cool"} ${
              selected.day === item.day ? "selected" : ""
            }`}
            key={item.day}
            onClick={() => setSelected(item)}
          >
            {item.day}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>July {selected.day}</strong>
        <span>{selected.value} activity points</span>
      </aside>
    </div>
  );
}
