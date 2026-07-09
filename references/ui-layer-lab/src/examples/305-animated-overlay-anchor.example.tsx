import { useState } from "react";

export default function AnimatedOverlayAnchorExample() {
  const [side, setSide] = useState<"left" | "right">("right");

  return (
    <div className="anchor-stage">
      <button className="command-trigger" onClick={() => setSide((value) => (value === "right" ? "left" : "right"))}>Move Anchor</button>
      <aside className={`anchor-popover ${side}`}>
        <strong>{side} anchored</strong>
        <span>Top layer detail follows the selected edge.</span>
      </aside>
    </div>
  );
}
