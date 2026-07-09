import { useState } from "react";
import type { CSSProperties } from "react";

export default function AnimatedModalStackDepthExample() {
  const [depth, setDepth] = useState(1);

  return (
    <div className={depth > 1 ? "stack-collapse collapsed" : "stack-collapse"}>
      <button className="command-trigger" onClick={() => setDepth((value) => (value === 1 ? 3 : 1))}>
        {depth === 1 ? "Open Stack" : "Close Stack"}
      </button>
      {Array.from({ length: depth }, (_, index) => (
        <section key={index} style={{ "--stack-index": index } as CSSProperties}>
          Layer {index + 1}
        </section>
      ))}
    </div>
  );
}
