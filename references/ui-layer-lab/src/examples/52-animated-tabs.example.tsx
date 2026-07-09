import { useState } from "react";

const tabs = [
  { id: "summary", title: "Summary", text: "One compact answer for the current screen." },
  { id: "logs", title: "Logs", text: "The latest failing step is highlighted first." },
  { id: "files", title: "Files", text: "Changed files are grouped by feature area." }
];

export default function AnimatedTabsExample() {
  const [active, setActive] = useState(tabs[0]);

  return (
    <div className="animated-tabs-card">
      <div className="animated-tabs-list">
        {tabs.map((tab) => (
          <button className={tab.id === active.id ? "active" : ""} key={tab.id} onClick={() => setActive(tab)}>
            {tab.title}
          </button>
        ))}
      </div>
      <div className="animated-tab-panel" key={active.id}>
        <strong>{active.title}</strong>
        <span>{active.text}</span>
      </div>
    </div>
  );
}
