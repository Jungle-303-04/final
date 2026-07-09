import { useState } from "react";

const tiles = ["Logs", "Diff", "Artifacts", "Checks", "Owners", "Notes"];

export default function AnimatedGridDensitySliderExample() {
  const [dense, setDense] = useState(false);

  return (
    <div className="density-slider-card">
      <button className="command-trigger" onClick={() => setDense((value) => !value)}>{dense ? "Comfortable" : "Dense"}</button>
      <div className={dense ? "density-grid dense" : "density-grid"}>
        {tiles.map((tile) => <span key={tile}>{tile}</span>)}
      </div>
    </div>
  );
}
