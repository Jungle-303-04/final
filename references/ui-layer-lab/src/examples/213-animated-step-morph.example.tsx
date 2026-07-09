import { useState } from "react";

const states = ["Idle", "Running", "Done"];

export default function AnimatedStepMorphExample() {
  const [index, setIndex] = useState(0);

  return (
    <div className="morph-card">
      <button className="command-trigger" onClick={() => setIndex((value) => (value + 1) % states.length)}>Next State</button>
      <div className={`morph-box state-${index}`}>
        <strong>{states[index]}</strong>
      </div>
    </div>
  );
}
