import { useState } from "react";

const cards = ["Command", "Overlay", "Job", "Drilldown"];

export default function AnimatedLayoutSwitchExample() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="layout-switch-demo">
      <button className="command-trigger" onClick={() => setExpanded((value) => !value)}>
        {expanded ? "Compact" : "Expand"}
      </button>
      <div className={`layout-switch-grid ${expanded ? "expanded" : ""}`}>
        {cards.map((card) => (
          <article key={card}>
            <strong>{card}</strong>
            <span>{expanded ? "Detailed state and supporting actions are visible." : "Collapsed"}</span>
          </article>
        ))}
      </div>
    </div>
  );
}
