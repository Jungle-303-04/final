import { useState } from "react";

const cards = ["Open logs", "Retry job", "Ask AI"];

export default function AnimatedHoverCommandPreviewExample() {
  const [active, setActive] = useState(cards[0]);

  return (
    <div className="suggestion-card-grid">
      {cards.map((card) => (
        <button className={active === card ? "hover-lift-card active" : "hover-lift-card"} key={card} onMouseEnter={() => setActive(card)}>
          <strong>{card}</strong>
          <span>Hover preview</span>
        </button>
      ))}
      <strong>{active}</strong>
    </div>
  );
}
