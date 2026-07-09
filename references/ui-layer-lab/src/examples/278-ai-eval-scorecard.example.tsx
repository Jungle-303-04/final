import { useState } from "react";

const scores = ["Accuracy", "Grounding", "Actionability"];

export default function AiEvalScorecardExample() {
  const [selected, setSelected] = useState("Grounding");

  return (
    <div className="metric-bars">
      {scores.map((score, index) => (
        <button className={selected === score ? "active" : ""} key={score} onClick={() => setSelected(score)}>
          <strong>{score}</strong>
          <div className="progress-track"><div style={{ width: `${74 + index * 7}%` }} /></div>
        </button>
      ))}
    </div>
  );
}
