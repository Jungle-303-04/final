import { toast } from "sonner";
import { useState } from "react";

const agents = ["Planner", "Coder", "Reviewer"];

export default function AiAgentHandoffToastExample() {
  const [index, setIndex] = useState(0);

  function handoff() {
    const next = (index + 1) % agents.length;
    setIndex(next);
    toast.info(`Handed off to ${agents[next]}`);
  }

  return (
    <div className="checkpoint-card">
      <button className="command-trigger" onClick={handoff}>Handoff</button>
      <div className="checkpoint-row">
        {agents.map((agent, agentIndex) => <span className={agentIndex === index ? "active" : ""} key={agent}>{agent}</span>)}
      </div>
    </div>
  );
}
