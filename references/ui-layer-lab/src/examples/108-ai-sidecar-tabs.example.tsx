import { useState } from "react";

const tabs = {
  answer: { label: "답변", value: "누락된 미리보기 라우트 때문에 실패했습니다." },
  sources: { label: "출처", value: "workflow.log, routes.tsx" },
  actions: { label: "조치", value: "라우트를 복구하고 스모크 테스트를 다시 실행하세요." }
};

export default function AiSidecarTabsExample() {
  const [tab, setTab] = useState<keyof typeof tabs>("answer");

  return (
    <div className="sidecar-tabs">
      <div className="ai-chat-card">
        <div className="chat-message user">무엇이 바뀌었나요?</div>
        <div className="chat-message assistant">라우트 수준 회귀를 하나 찾았습니다.</div>
      </div>
      <aside className="detail-panel">
        <div className="segmented-row">
          {Object.keys(tabs).map((key) => (
            <button className={tab === key ? "active" : ""} key={key} onClick={() => setTab(key as keyof typeof tabs)} type="button">
              {tabs[key as keyof typeof tabs].label}
            </button>
          ))}
        </div>
        <span>{tabs[tab].value}</span>
      </aside>
    </div>
  );
}
