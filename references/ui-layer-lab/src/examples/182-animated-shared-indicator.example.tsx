import { useState } from "react";

const tabs = ["요약", "로그", "산출물"];

export default function AnimatedSharedIndicatorExample() {
  const [active, setActive] = useState(0);

  return (
    <div className="shared-indicator-card">
      <div className="shared-tabs">
        <span style={{ transform: `translateX(${active * 100}%)` }} />
        {tabs.map((tab, index) => (
          <button aria-pressed={active === index} className={active === index ? "active" : ""} key={tab} onClick={() => setActive(index)} type="button">
            {tab}
          </button>
        ))}
      </div>
      <strong>{tabs[active]} 선택됨</strong>
    </div>
  );
}
