import { useState } from "react";

export default function JobHealthScoreExample() {
  const [score, setScore] = useState(82);

  return (
    <div className="phase-ring-card">
      <div className="phase-ring" style={{ background: `conic-gradient(var(--accent) ${score}%, var(--panel-soft) 0)` }}>
        <span aria-live="polite">{score}</span>
      </div>
      <span>배포 상태 점수</span>
      <button
        aria-label="배포 상태 점수 다시 계산"
        className="command-trigger stable-wide"
        onClick={() => setScore((value) => (value > 45 ? value - 11 : 94))}
        type="button"
      >
        다시 계산
      </button>
    </div>
  );
}
