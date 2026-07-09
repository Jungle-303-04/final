import { useState } from "react";

const initial = ["release", "visual-smoke", "docs", "cleanup"];

export default function JobPriorityQueueExample() {
  const [queue, setQueue] = useState(initial);

  function promote(item: string) {
    setQueue((items) => [item, ...items.filter((value) => value !== item)]);
  }

  return (
    <div className="priority-list">
      {queue.map((item, index) => (
        <button className={index === 0 ? "active" : ""} key={item} onClick={() => promote(item)}>
          <span>P{index + 1}</span>{item}
        </button>
      ))}
    </div>
  );
}
