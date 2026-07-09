import { useState } from "react";

const agents = ["Planner", "Coder", "Reviewer"];

export default function AiAgentHandoffMapExample() {
  const [active, setActive] = useState("Planner");

  return (
    <div className="handoff-map">
      {agents.map((agent) => (
        <button className={active === agent ? "active" : ""} key={agent} onClick={() => setActive(agent)}>
          <strong>{agent}</strong>
          <span>{agent === active ? "active" : "waiting"}</span>
        </button>
      ))}
    </div>
  );
}
