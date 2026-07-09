import { useState } from "react";

const rows = ["macOS", "리눅스", "윈도우"];
const cols = ["Node 18", "Node 20", "Node 22"];

export default function JobMatrixDashboardExample() {
  const [cell, setCell] = useState("리눅스 / Node 20");

  return (
    <div className="matrix-dashboard">
      {rows.map((row) =>
        cols.map((col) => {
          const label = `${row} / ${col}`;

          return (
            <button
              aria-label={`${label} 매트릭스 셀 선택`}
              aria-pressed={cell === label}
              className={cell === label ? "active" : ""}
              key={`${row}-${col}`}
              onClick={() => setCell(label)}
              type="button"
            >
              {row}<span>{col}</span>
            </button>
          );
        })
      )}
      <strong aria-live="polite">선택한 조합: {cell}</strong>
    </div>
  );
}
