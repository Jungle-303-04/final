import { useState } from "react";

const agents = ["기획", "구현", "검토"];

export default function AiAgentHandoffMapExample() {
  const [active, setActive] = useState("기획");

  return (
    <div className="handoff-map">
      {agents.map((agent) => (
        <button aria-pressed={active === agent} className={active === agent ? "active" : ""} key={agent} onClick={() => setActive(agent)} type="button">
          <strong>{agent}</strong>
          <span>{agent === active ? "활성" : "대기"}</span>
        </button>
      ))}
    </div>
  );
}
