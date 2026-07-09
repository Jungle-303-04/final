import { useState } from "react";

const sources = ["diff.patch", "workflow.log", "README.md"];

export default function AiContextSourcePriorityExample() {
  const [items, setItems] = useState(sources);

  function promote(source: string) {
    setItems((value) => [source, ...value.filter((item) => item !== source)]);
  }

  return (
    <div className="priority-list">
      {items.map((source, index) => <button className={index === 0 ? "active" : ""} key={source} onClick={() => promote(source)}><span>{index + 1}</span>{source}</button>)}
    </div>
  );
}
