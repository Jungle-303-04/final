import { useState } from "react";

const cards = ["Logs", "Diff", "Preview"];

export default function AnimatedFocusRingExample() {
  const [active, setActive] = useState("Logs");

  return (
    <div className="focus-ring-grid">
      {cards.map((card) => (
        <button className={active === card ? "active" : ""} key={card} onClick={() => setActive(card)}>
          <strong>{card}</strong>
          <span>{active === card ? "Focused" : "Idle"}</span>
        </button>
      ))}
    </div>
  );
}
