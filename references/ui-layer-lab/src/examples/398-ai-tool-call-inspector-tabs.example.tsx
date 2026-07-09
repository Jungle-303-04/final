import { useState } from "react";

const tabs = {
  Request: "run npm test",
  Output: "2 failed, 18 passed",
  Patch: "src/App.tsx"
};

export default function AiToolCallInspectorTabsExample() {
  const [tab, setTab] = useState<keyof typeof tabs>("Request");

  return (
    <div className="animated-tabs-card">
      <div className="animated-tabs-list">
        {Object.keys(tabs).map((item) => (
          <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item as keyof typeof tabs)}>
            {item}
          </button>
        ))}
      </div>
      <div className="animated-tab-panel">
        <strong>{tab}</strong>
        <span>{tabs[tab]}</span>
      </div>
    </div>
  );
}
