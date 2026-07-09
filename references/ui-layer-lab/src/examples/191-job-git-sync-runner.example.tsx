import { useState } from "react";

const steps = ["git pull", "npm test", "git push"];

export default function JobGitSyncRunnerExample() {
  const [active, setActive] = useState(0);

  return (
    <div className="git-sync-card">
      <button className="command-trigger" onClick={() => setActive((value) => (value + 1) % steps.length)}>Advance</button>
      {steps.map((step, index) => (
        <div className={`git-step ${index === active ? "active" : index < active ? "done" : ""}`} key={step}>
          <code>{step}</code>
          <span>{index === active ? "running" : index < active ? "done" : "waiting"}</span>
        </div>
      ))}
    </div>
  );
}
