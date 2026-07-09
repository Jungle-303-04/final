import { useState } from "react";

const phases = [
  { name: "가져오기", progress: 25 },
  { name: "빌드", progress: 58 },
  { name: "검증", progress: 84 }
];

export default function JobPhaseRingExample() {
  const [index, setIndex] = useState(1);
  const phase = phases[index];

  return (
    <div className="phase-ring-card">
      <div className="phase-ring" style={{ background: `conic-gradient(var(--text) ${phase.progress}%, var(--border) 0)` }}>
        <span>{phase.progress}%</span>
      </div>
      <strong>{phase.name}</strong>
      <button className="command-trigger stable-wide" onClick={() => setIndex((value) => (value + 1) % phases.length)} type="button">
        다음 단계
      </button>
    </div>
  );
}
