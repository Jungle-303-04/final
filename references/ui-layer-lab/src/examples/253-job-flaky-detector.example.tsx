import { useState } from "react";

const tests = ["시각 스모크", "인증 흐름", "결제 웹훅"];

export default function JobFlakyDetectorExample() {
  const [selected, setSelected] = useState("시각 스모크");

  return (
    <div className="metric-bars">
      {tests.map((test, index) => (
        <button
          aria-label={`${test} 불안정도 ${35 + index * 24}% 선택`}
          aria-pressed={selected === test}
          className={selected === test ? "active" : ""}
          key={test}
          onClick={() => setSelected(test)}
          type="button"
        >
          <strong>{test}</strong>
          <div className="progress-track"><div style={{ width: `${35 + index * 24}%` }} /></div>
        </button>
      ))}
      <span aria-live="polite">{selected} 불안정 신호</span>
    </div>
  );
}
