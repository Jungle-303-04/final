import { useState } from "react";

const steps = ["fetch", "pull", "test", "push"];

export default function JobGitPullPushTimelineExample() {
  const [active, setActive] = useState(1);

  return (
    <div className="checkpoint-card">
      <button className="command-trigger" onClick={() => setActive((value) => (value + 1) % steps.length)}>Next Git Step</button>
      <div className="checkpoint-row">
        {steps.map((step, index) => <span className={index <= active ? "active" : ""} key={step}>{step}</span>)}
      </div>
      <strong>{steps[active]}</strong>
    </div>
  );
}
