import { useState } from "react";

const events = ["read file", "apply patch", "run typecheck", "summarize"];

export default function AiToolStreamTimelineExample() {
  const [count, setCount] = useState(2);

  return (
    <div className="animated-stagger">
      <button className="command-trigger" onClick={() => setCount((value) => (value >= events.length ? 1 : value + 1))}>Stream Next</button>
      {events.slice(0, count).map((event, index) => <div className="stagger-row" key={event}><span>{index + 1}</span>{event}</div>)}
    </div>
  );
}
