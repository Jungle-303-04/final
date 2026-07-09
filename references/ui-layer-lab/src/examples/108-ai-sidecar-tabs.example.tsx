import { useState } from "react";

const tabs = {
  answer: "The failure is caused by a missing preview route.",
  sources: "workflow.log, routes.tsx",
  actions: "Restore route, rerun smoke test"
};

export default function AiSidecarTabsExample() {
  const [tab, setTab] = useState<keyof typeof tabs>("answer");

  return (
    <div className="sidecar-tabs">
      <div className="ai-chat-card">
        <div className="chat-message user">What changed?</div>
        <div className="chat-message assistant">I found one route-level regression.</div>
      </div>
      <aside className="detail-panel">
        <div className="segmented-row">
          {Object.keys(tabs).map((key) => (
            <button className={tab === key ? "active" : ""} key={key} onClick={() => setTab(key as keyof typeof tabs)}>
              {key}
            </button>
          ))}
        </div>
        <span>{tabs[tab]}</span>
      </aside>
    </div>
  );
}
