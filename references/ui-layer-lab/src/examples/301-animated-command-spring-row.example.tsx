import { useState } from "react";

const rows = ["Open branch", "Run visual smoke", "Ask AI for fix"];

export default function AnimatedCommandSpringRowExample() {
  const [active, setActive] = useState(rows[0]);

  return (
    <div className="stack-list">
      {rows.map((row) => (
        <button className={active === row ? "active spring-row" : "spring-row"} key={row} onClick={() => setActive(row)}>
          {row}
        </button>
      ))}
      <span className="brush-count">Selected: {active}</span>
    </div>
  );
}
