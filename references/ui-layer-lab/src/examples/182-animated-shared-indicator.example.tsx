import { useState } from "react";

const tabs = ["Summary", "Logs", "Artifacts"];

export default function AnimatedSharedIndicatorExample() {
  const [active, setActive] = useState(0);

  return (
    <div className="shared-indicator-card">
      <div className="shared-tabs">
        <span style={{ transform: `translateX(${active * 100}%)` }} />
        {tabs.map((tab, index) => (
          <button className={active === index ? "active" : ""} key={tab} onClick={() => setActive(index)}>
            {tab}
          </button>
        ))}
      </div>
      <strong>{tabs[active]} selected</strong>
    </div>
  );
}
