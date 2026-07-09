import { useState } from "react";

export default function AnimatedDensityPanelExample() {
  const [dense, setDense] = useState(false);
  const rows = ["빌드", "검사", "배포", "스모크"];

  return (
    <div className={dense ? "density-panel dense" : "density-panel"}>
      <button aria-pressed={dense} className="command-trigger stable-wide" onClick={() => setDense((value) => !value)} type="button">
        {dense ? "여유 보기" : "밀도 높이기"}
      </button>
      {rows.map((row) => <span key={row}>{row}</span>)}
    </div>
  );
}
