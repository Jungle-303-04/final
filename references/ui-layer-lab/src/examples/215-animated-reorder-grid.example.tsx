import { useState } from "react";

const cards = ["A", "B", "C", "D"];

export default function AnimatedReorderGridExample() {
  const [items, setItems] = useState(cards);

  return (
    <div className="reorder-grid-demo">
      <button className="command-trigger stable-wide" onClick={() => setItems((value) => [...value.slice(1), value[0]])} type="button">순서 회전</button>
      <div className="focus-ring-grid">
        {items.map((item) => <button className="active" key={item} type="button">{item}<span>레이아웃 슬롯</span></button>)}
      </div>
    </div>
  );
}
