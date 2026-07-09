import { useState } from "react";

const scores = ["정확도", "근거성", "실행 가능성"];

export default function AiEvalScorecardExample() {
  const [selected, setSelected] = useState("근거성");

  return (
    <div className="metric-bars">
      {scores.map((score, index) => (
        <button
          aria-label={`${score} 점수 ${74 + index * 7}% 선택`}
          aria-pressed={selected === score}
          className={selected === score ? "active" : ""}
          key={score}
          onClick={() => setSelected(score)}
          type="button"
        >
          <strong>{score}</strong>
          <div className="progress-track"><div style={{ width: `${74 + index * 7}%` }} /></div>
        </button>
      ))}
      <span aria-live="polite">선택한 평가: {selected}</span>
    </div>
  );
}
