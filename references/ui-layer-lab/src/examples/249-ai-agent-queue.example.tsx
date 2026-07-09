import { useState } from "react";

const queue = ["Read logs", "Draft fix", "Run tests"];

export default function AiAgentQueueExample() {
  const [done, setDone] = useState(0);

  return (
    <div className="agent-steps">
      <button className="command-trigger" onClick={() => setDone((value) => Math.min(queue.length, value + 1))}>Advance</button>
      {queue.map((item, index) => (
        <div className={index < done ? "agent-step active" : "agent-step"} key={item}>
          <span>{index + 1}</span>
          <strong>{item}</strong>
        </div>
      ))}
    </div>
  );
}
