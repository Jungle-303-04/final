import { useState } from "react";

const tabs = [
  { id: "summary", title: "요약", text: "현재 화면에 필요한 답변만 짧게 보여줍니다." },
  { id: "logs", title: "로그", text: "최근 실패 단계가 먼저 강조됩니다." },
  { id: "files", title: "파일", text: "변경 파일을 기능 영역 기준으로 묶습니다." }
];

export default function AnimatedTabsExample() {
  const [active, setActive] = useState(tabs[0]);

  return (
    <div className="animated-tabs-card">
      <div className="animated-tabs-list">
        {tabs.map((tab) => (
          <button className={tab.id === active.id ? "active" : ""} key={tab.id} onClick={() => setActive(tab)} type="button">
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
