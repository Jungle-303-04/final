import { useState } from "react";

const initialRows = ["lint", "typecheck", "build", "smoke"];

export default function AnimatedExitListExample() {
  const [rows, setRows] = useState(initialRows);

  return (
    <div className="animated-filter-list">
      <button className="command-trigger" onClick={() => setRows((items) => items.slice(1))}>Complete First</button>
      {rows.map((row) => (
        <div className="filter-row" key={row}>
          <strong>{row}</strong>
          <span>running</span>
        </div>
      ))}
    </div>
  );
}
