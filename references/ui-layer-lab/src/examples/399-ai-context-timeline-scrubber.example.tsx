import { useState } from "react";

const context = ["branch opened", "logs attached", "fix drafted", "tests passed"];

export default function AiContextTimelineScrubberExample() {
  const [index, setIndex] = useState(1);

  return (
    <div className="checkpoint-card">
      <input max={context.length - 1} min={0} onChange={(event) => setIndex(Number(event.target.value))} type="range" value={index} />
      <div className="checkpoint-row">
        {context.map((item, itemIndex) => <span className={itemIndex <= index ? "active" : ""} key={item}>{item}</span>)}
      </div>
      <strong>{context[index]}</strong>
    </div>
  );
}
