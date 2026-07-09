import { useState } from "react";

const initial = ["lint", "typecheck", "build", "visual-smoke"];

export default function AnimatedQueueReorderExample() {
  const [items, setItems] = useState(initial);

  return (
    <div className="animated-stagger">
      <button className="command-trigger" onClick={() => setItems((value) => [value[value.length - 1], ...value.slice(0, -1)])}>Promote Last</button>
      {items.map((item, index) => <div className="stagger-row" key={item}><span>{index + 1}</span>{item}</div>)}
    </div>
  );
}
