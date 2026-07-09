import { useState } from "react";

const ops = ["fetch", "pull", "rebase", "push"];

export default function JobGitOperationStackExample() {
  const [done, setDone] = useState(2);

  return (
    <div className="animated-stagger">
      <button className="command-trigger" onClick={() => setDone((value) => (value >= ops.length ? 1 : value + 1))}>Advance Git</button>
      {ops.map((op, index) => <div className={index < done ? "stagger-row" : "stagger-row muted-row"} key={op}><span>{index + 1}</span>{op}</div>)}
    </div>
  );
}
