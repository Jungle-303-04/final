import { useState } from "react";

const lanes = {
  Planner: ["Read request", "Draft steps", "Wait for approval"],
  Coder: ["Edit files", "Run checks", "Summarize patch"],
  Reviewer: ["Inspect diff", "Flag risk", "Approve"]
};

export default function AiWorkflowLaneSwitcherExample() {
  const [lane, setLane] = useState<keyof typeof lanes>("Planner");

  return (
    <div className="agent-steps">
      <div className="segmented-row">
        {Object.keys(lanes).map((item) => <button className={lane === item ? "active" : ""} key={item} onClick={() => setLane(item as keyof typeof lanes)}>{item}</button>)}
      </div>
      {lanes[lane].map((step, index) => <div className={index === 1 ? "agent-step active" : "agent-step"} key={step}><span>{index + 1}</span>{step}</div>)}
    </div>
  );
}
