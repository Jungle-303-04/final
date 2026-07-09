import { useState } from "react";

const anchors = ["left", "right"] as const;

export default function AnimatedPopoverAnchorMapExample() {
  const [anchor, setAnchor] = useState<(typeof anchors)[number]>("left");

  return (
    <div className="anchor-stage">
      <div className="animated-tabs-list">
        {anchors.map((item) => (
          <button className={anchor === item ? "active" : ""} key={item} onClick={() => setAnchor(item)}>
            {item}
          </button>
        ))}
      </div>
      <aside className={`anchor-popover ${anchor}`}>
        <strong>{anchor} anchor</strong>
        <span>Top layer follows the active trigger</span>
      </aside>
    </div>
  );
}
