import { useState } from "react";

const stages = ["detect", "freeze", "restore", "verify"];

export default function JobRollbackTimelineExample() {
  const [active, setActive] = useState(1);

  return (
    <div className="animated-stagger">
      <button className="command-trigger" onClick={() => setActive((value) => Math.min(stages.length - 1, value + 1))}>Advance Rollback</button>
      {stages.map((stage, index) => <div className={index <= active ? "stagger-row" : "stagger-row muted-row"} key={stage}><span>{index + 1}</span>{stage}</div>)}
    </div>
  );
}
