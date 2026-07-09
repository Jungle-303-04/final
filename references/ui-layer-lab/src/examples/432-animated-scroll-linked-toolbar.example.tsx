import { useState } from "react";

export default function AnimatedScrollLinkedToolbarExample() {
  const [progress, setProgress] = useState(40);

  return (
    <div className="scroll-progress-card">
      <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
      <input max={100} min={0} onChange={(event) => setProgress(Number(event.target.value))} type="range" value={progress} />
      <strong>{progress}% scrolled</strong>
    </div>
  );
}
