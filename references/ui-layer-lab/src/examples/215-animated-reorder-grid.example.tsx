import { useState } from "react";

const cards = ["A", "B", "C", "D"];

export default function AnimatedReorderGridExample() {
  const [items, setItems] = useState(cards);

  return (
    <div className="reorder-grid-demo">
      <button className="command-trigger" onClick={() => setItems((value) => [...value.slice(1), value[0]])}>Rotate</button>
      <div className="focus-ring-grid">
        {items.map((item) => <button className="active" key={item}>{item}<span>layout slot</span></button>)}
      </div>
    </div>
  );
}
