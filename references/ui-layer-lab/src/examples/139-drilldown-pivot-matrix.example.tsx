import { useState } from "react";

const rows = ["api", "web", "worker"];
const columns = ["failed", "running", "success"];

export default function DrilldownPivotMatrixExample() {
  const [selected, setSelected] = useState("api / failed");

  return (
    <div className="heatmap-demo">
      <div className="pivot-matrix">
        <span />
        {columns.map((column) => <strong key={column}>{column}</strong>)}
        {rows.map((row, rowIndex) => (
          <div className="heatmap-row" key={row}>
            <strong>{row}</strong>
            {columns.map((column, columnIndex) => (
              <button key={column} onClick={() => setSelected(`${row} / ${column}`)}>
                {(rowIndex + 1) * (columnIndex + 2)}
              </button>
            ))}
          </div>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{selected}</strong>
        <span>Pivot cell selected.</span>
      </aside>
    </div>
  );
}
