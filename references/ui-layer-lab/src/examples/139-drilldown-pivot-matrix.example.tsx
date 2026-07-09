import { useState } from "react";

const rows = ["API", "웹", "워커"];
const columns = ["실패", "진행", "성공"];

export default function DrilldownPivotMatrixExample() {
  const [selected, setSelected] = useState("API / 실패");

  return (
    <div className="heatmap-demo">
      <div className="pivot-matrix">
        <span />
        {columns.map((column) => <strong key={column}>{column}</strong>)}
        {rows.map((row, rowIndex) => (
          <div className="heatmap-row" key={row}>
            <strong>{row}</strong>
            {columns.map((column, columnIndex) => (
              <button aria-label={`${row} ${column} 셀 선택`} key={column} onClick={() => setSelected(`${row} / ${column}`)} type="button">
                {(rowIndex + 1) * (columnIndex + 2)}
              </button>
            ))}
          </div>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{selected}</strong>
        <span>선택한 피벗 셀입니다.</span>
      </aside>
    </div>
  );
}
