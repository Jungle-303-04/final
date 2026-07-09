import { useState } from "react";

const initialRows = ["린트", "타입 검사", "빌드", "스모크"];

export default function AnimatedExitListExample() {
  const [rows, setRows] = useState(initialRows);

  return (
    <div className="animated-filter-list">
      <button className="command-trigger stable-wide" onClick={() => setRows((items) => items.slice(1))} type="button">첫 항목 완료</button>
      {rows.map((row) => (
        <div className="filter-row" key={row}>
          <strong>{row}</strong>
          <span>실행 중</span>
        </div>
      ))}
    </div>
  );
}
