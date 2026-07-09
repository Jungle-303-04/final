import { useState } from "react";

const states = ["pending", "rotating", "verified"];

export default function JobSecretRotationStatusExample() {
  const [index, setIndex] = useState(0);

  return (
    <div className="checkpoint-card">
      <button className="command-trigger" onClick={() => setIndex((value) => (value + 1) % states.length)}>Rotate Secret</button>
      <div className="checkpoint-row">
        {states.map((state, stateIndex) => <span className={stateIndex <= index ? "active" : ""} key={state}>{state}</span>)}
      </div>
    </div>
  );
}
