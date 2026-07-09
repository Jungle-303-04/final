import { useState } from "react";

const initial = ["visual smoke", "typecheck", "build"];

export default function AnimatedPriorityReorderListExample() {
  const [items, setItems] = useState(initial);

  function promote(item: string) {
    setItems((current) => [item, ...current.filter((value) => value !== item)]);
  }

  return (
    <div className="sortable-list">
      {items.map((item) => <button className="row-button spring-row" key={item} onClick={() => promote(item)}>{item}</button>)}
    </div>
  );
}
