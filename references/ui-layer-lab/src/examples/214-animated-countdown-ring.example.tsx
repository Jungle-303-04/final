import { useState } from "react";

export default function AnimatedCountdownRingExample() {
  const [value, setValue] = useState(72);

  return (
    <div className="phase-ring-card">
      <div className="phase-ring" style={{ background: `conic-gradient(var(--accent) ${value}%, var(--border) 0)` }}>
        <span>{value}%</span>
      </div>
      <button className="command-trigger stable-wide" onClick={() => setValue((item) => (item <= 12 ? 100 : item - 12))} type="button">시간 진행</button>
    </div>
  );
}
