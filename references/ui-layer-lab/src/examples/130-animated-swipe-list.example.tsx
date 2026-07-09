import { useState } from "react";

const initial = ["Review logs", "Fix route", "Rerun smoke"];

export default function AnimatedSwipeListExample() {
  const [items, setItems] = useState(initial);

  return (
    <div className="swipe-list">
      {items.map((item) => (
        <div className="swipe-row" key={item}>
          <span>{item}</span>
          <button onClick={() => setItems((current) => current.filter((value) => value !== item))}>Done</button>
        </div>
      ))}
      {items.length === 0 ? <span className="muted">All clear</span> : null}
    </div>
  );
}
