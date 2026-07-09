import { useState } from "react";

const envs = ["dev", "staging", "production"];

export default function JobEnvironmentPromotionExample() {
  const [index, setIndex] = useState(1);

  return (
    <div className="checkpoint-card">
      <button className="command-trigger" onClick={() => setIndex((value) => Math.min(envs.length - 1, value + 1))}>Promote</button>
      <div className="checkpoint-row">
        {envs.map((env, envIndex) => <span className={envIndex <= index ? "active" : ""} key={env}>{env}</span>)}
      </div>
      <strong>Current: {envs[index]}</strong>
    </div>
  );
}
