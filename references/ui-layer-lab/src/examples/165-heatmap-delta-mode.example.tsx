import { useState } from "react";

const values = [12, -8, 31, -22, 44, -15, 7, 28, -33];

export default function HeatmapDeltaModeExample() {
  const [absolute, setAbsolute] = useState(false);

  return (
    <div className="threshold-heatmap">
      <button className="command-trigger stable-wide" onClick={() => setAbsolute((value) => !value)} type="button">
        {absolute ? "변화량 보기" : "절대값 보기"}
      </button>
      <div className="small-heatmap-grid">
        {values.map((value, index) => {
          const display = absolute ? Math.abs(value) : value;
          return (
            <button className={`heat-cell ${display > 25 ? "hot" : display > 10 ? "warm" : "cool"}`} key={index} type="button">
              {display}
            </button>
          );
        })}
      </div>
    </div>
  );
}
