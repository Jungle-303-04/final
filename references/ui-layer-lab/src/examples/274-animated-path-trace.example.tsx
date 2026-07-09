import { useState } from "react";

export default function AnimatedPathTraceExample() {
  const [active, setActive] = useState(true);

  return (
    <div className="path-trace-card">
      <svg viewBox="0 0 360 160" aria-hidden="true">
        <path className={active ? "tracing" : ""} d="M24 120 C90 20 150 20 208 92 S300 154 336 42" />
      </svg>
      <span aria-live="polite" className="stable-text-slot wide">{active ? "경로 추적 중" : "추적 일시 정지"}</span>
      <button aria-pressed={active} className="command-trigger stable-wide" onClick={() => setActive((value) => !value)} type="button">
        {active ? "일시 정지" : "추적 재개"}
      </button>
    </div>
  );
}
