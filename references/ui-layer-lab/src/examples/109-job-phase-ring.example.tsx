import { useState } from "react";

const phases = [
  { name: "fetch", progress: 25 },
  { name: "build", progress: 58 },
  { name: "verify", progress: 84 }
];

export default function JobPhaseRingExample() {
  const [index, setIndex] = useState(1);
  const phase = phases[index];

  return (
    <div className="phase-ring-card">
      <div className="phase-ring" style={{ background: `conic-gradient(#fafafa ${phase.progress}%, #27272a 0)` }}>
        <span>{phase.progress}%</span>
      </div>
      <strong>{phase.name}</strong>
      <button className="command-trigger" onClick={() => setIndex((value) => (value + 1) % phases.length)}>
        Next Phase
      </button>
    </div>
  );
}
