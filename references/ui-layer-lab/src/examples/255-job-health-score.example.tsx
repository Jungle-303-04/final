import { useState } from "react";

export default function JobHealthScoreExample() {
  const [score, setScore] = useState(82);

  return (
    <div className="phase-ring-card">
      <div className="phase-ring" style={{ background: `conic-gradient(#fafafa ${score}%, #27272a 0)` }}>
        <span>{score}</span>
      </div>
      <span>Deployment health score</span>
      <button className="command-trigger" onClick={() => setScore((value) => (value > 45 ? value - 11 : 94))}>Recalculate</button>
    </div>
  );
}
