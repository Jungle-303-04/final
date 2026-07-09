import { useState } from "react";

const rows = Array.from({ length: 18 }, (_, index) => `event ${String(index + 1).padStart(2, "0")} · workflow log line`);

export default function AnimatedScrollProgressExample() {
  const [progress, setProgress] = useState(0);

  return (
    <div className="scroll-progress-card">
      <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
      <div
        className="scroll-fade-content"
        onScroll={(event) => {
          const target = event.currentTarget;
          setProgress(Math.round((target.scrollTop / (target.scrollHeight - target.clientHeight)) * 100));
        }}
      >
        {rows.map((row) => <code key={row}>{row}</code>)}
      </div>
    </div>
  );
}
