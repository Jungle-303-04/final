import { useState } from "react";

const milestones = ["queued", "running", "verifying", "published"];

export default function JobProgressMilestoneMapExample() {
  const [active, setActive] = useState(1);

  return (
    <div className="checkpoint-card">
      <button className="command-trigger" onClick={() => setActive((value) => (value + 1) % milestones.length)}>Next Milestone</button>
      <div className="checkpoint-row">
        {milestones.map((item, index) => <span className={index <= active ? "active" : ""} key={item}>{item}</span>)}
      </div>
    </div>
  );
}
