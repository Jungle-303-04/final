import { useState } from "react";
import type { CSSProperties } from "react";

const cards = ["Pull", "Typecheck", "Build"];

export default function AnimatedStackCollapseExample() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={collapsed ? "stack-collapse collapsed" : "stack-collapse"}>
      <button className="command-trigger" onClick={() => setCollapsed((value) => !value)}>{collapsed ? "Expand" : "Collapse"}</button>
      {cards.map((card, index) => <section style={{ "--stack-index": index } as CSSProperties} key={card}>{card}</section>)}
    </div>
  );
}
