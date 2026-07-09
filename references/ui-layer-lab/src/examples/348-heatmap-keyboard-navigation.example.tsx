import { useState } from "react";

const values = [9, 18, 27, 36, 45, 54, 63, 72, 81];

export default function HeatmapKeyboardNavigationExample() {
  const [index, setIndex] = useState(4);

  return (
    <div className="threshold-heatmap">
      <div className="small-heatmap-grid">
        {values.map((value, valueIndex) => (
          <button className={`heat-cell ${valueIndex === index ? "selected" : value > 60 ? "hot" : value > 30 ? "warm" : "cool"}`} key={value} onClick={() => setIndex(valueIndex)}>{value}</button>
        ))}
      </div>
      <button className="command-trigger" onClick={() => setIndex((value) => (value + 1) % values.length)}>Move Focus</button>
      <span className="brush-count">Focused value {values[index]}</span>
    </div>
  );
}
