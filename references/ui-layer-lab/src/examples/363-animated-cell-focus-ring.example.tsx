import { useState } from "react";

const cells = ["A1", "A2", "B1", "B2"];

export default function AnimatedCellFocusRingExample() {
  const [cell, setCell] = useState("A1");

  return (
    <div className="cell-focus-grid">
      {cells.map((item) => <button className={cell === item ? "active" : ""} key={item} onClick={() => setCell(item)}>{item}</button>)}
    </div>
  );
}
