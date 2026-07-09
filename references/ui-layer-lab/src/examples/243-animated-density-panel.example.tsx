import { useState } from "react";

export default function AnimatedDensityPanelExample() {
  const [dense, setDense] = useState(false);
  const rows = ["build", "test", "deploy", "smoke"];

  return (
    <div className={dense ? "density-panel dense" : "density-panel"}>
      <button className="command-trigger" onClick={() => setDense((value) => !value)}>{dense ? "Comfortable" : "Dense"}</button>
      {rows.map((row) => <span key={row}>{row}</span>)}
    </div>
  );
}
