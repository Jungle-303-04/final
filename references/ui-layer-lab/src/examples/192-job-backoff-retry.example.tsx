import { useState } from "react";

const delays = [1, 2, 4, 8];

export default function JobBackoffRetryExample() {
  const [attempt, setAttempt] = useState(0);

  return (
    <div className="retry-card failed">
      <strong>Retry attempt {attempt + 1}</strong>
      <span>Next retry in {delays[attempt]}s</span>
      <div className="progress-track"><div style={{ width: `${(attempt + 1) * 25}%` }} /></div>
      <button className="command-trigger" onClick={() => setAttempt((value) => (value + 1) % delays.length)}>Retry Failed Step</button>
    </div>
  );
}
