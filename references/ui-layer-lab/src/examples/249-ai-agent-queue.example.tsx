import { useState } from "react";

const queue = ["로그 읽기", "수정안 작성", "검사 실행"];

export default function AiAgentQueueExample() {
  const [done, setDone] = useState(0);

  return (
    <div className="agent-steps">
      <button className="command-trigger stable-wide" onClick={() => setDone((value) => Math.min(queue.length, value + 1))} type="button">다음 단계</button>
      {queue.map((item, index) => (
        <div className={index < done ? "agent-step active" : "agent-step"} key={item}>
          <span>{index + 1}</span>
          <strong>{item}</strong>
        </div>
      ))}
    </div>
  );
}
