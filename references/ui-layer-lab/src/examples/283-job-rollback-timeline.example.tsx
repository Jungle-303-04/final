import { useState } from "react";

const stages = ["감지", "동결", "복원", "검증"];

export default function JobRollbackTimelineExample() {
  const [active, setActive] = useState(1);

  return (
    <div className="animated-stagger">
      <button className="command-trigger stable-wide" onClick={() => setActive((value) => Math.min(stages.length - 1, value + 1))} type="button">
        롤백 진행
      </button>
      {stages.map((stage, index) => (
        <div aria-current={index === active ? "step" : undefined} className={index <= active ? "stagger-row" : "stagger-row muted-row"} key={stage}>
          <span>{index + 1}</span>{stage}
        </div>
      ))}
    </div>
  );
}
