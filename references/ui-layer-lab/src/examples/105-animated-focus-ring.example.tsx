import { useState } from "react";

const cards = ["로그", "Diff", "미리보기"];

export default function AnimatedFocusRingExample() {
  const [active, setActive] = useState("로그");

  return (
    <div className="focus-ring-grid">
      {cards.map((card) => (
        <button className={active === card ? "active" : ""} key={card} onClick={() => setActive(card)} type="button">
          <strong>{card}</strong>
          <span>{active === card ? "포커스됨" : "대기"}</span>
        </button>
      ))}
    </div>
  );
}
