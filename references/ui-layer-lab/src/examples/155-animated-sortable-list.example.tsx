import { useState } from "react";

export default function AnimatedSortableListExample() {
  const [items, setItems] = useState(["High", "Medium", "Low"]);

  function reverse() {
    setItems((current) => [...current].reverse());
  }

  return (
    <div className="sortable-list">
      <button className="command-trigger" onClick={reverse}>Reverse</button>
      {items.map((item) => (
        <div className="filter-row" key={item}>
          <strong>{item}</strong>
          <span>priority</span>
        </div>
      ))}
    </div>
  );
}
