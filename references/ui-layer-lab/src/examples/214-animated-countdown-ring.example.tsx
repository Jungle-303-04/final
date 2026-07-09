import { useState } from "react";

export default function AnimatedCountdownRingExample() {
  const [value, setValue] = useState(72);

  return (
    <div className="phase-ring-card">
      <div className="phase-ring" style={{ background: `conic-gradient(#fafafa ${value}%, #27272a 0)` }}>
        <span>{value}%</span>
      </div>
      <button className="command-trigger" onClick={() => setValue((item) => (item <= 12 ? 100 : item - 12))}>Tick</button>
    </div>
  );
}
