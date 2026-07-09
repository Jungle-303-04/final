import { useState } from "react";

const checkpoints = ["queued", "checkout", "build", "smoke", "publish"];

export default function AnimatedProgressCheckpointsExample() {
  const [index, setIndex] = useState(1);

  return (
    <div className="checkpoint-card">
      <button className="command-trigger" onClick={() => setIndex((value) => (value + 1) % checkpoints.length)}>Next Checkpoint</button>
      <div className="progress-track"><div style={{ width: `${((index + 1) / checkpoints.length) * 100}%` }} /></div>
      <div className="checkpoint-row">
        {checkpoints.map((item, itemIndex) => <span className={itemIndex <= index ? "active" : ""} key={item}>{item}</span>)}
      </div>
    </div>
  );
}
