import { useState } from "react";

const views = {
  failures: { label: "실패", items: ["시각 검사", "프리뷰 배포"] },
  running: { label: "실행 중", items: ["API 빌드"] },
  mine: { label: "내 작업", items: ["대상 동기화", "문서 검사"] }
};

export default function DrilldownSavedViewExample() {
  const [view, setView] = useState<keyof typeof views>("failures");
  const current = views[view];

  return (
    <div className="drill-grid">
      <div className="drawer">
        <div className="segmented-row">
          {Object.keys(views).map((item) => (
            <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item as keyof typeof views)} type="button">
              {views[item as keyof typeof views].label}
            </button>
          ))}
        </div>
        {current.items.map((item) => (
          <button className="row-button" key={item} type="button">{item}</button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{current.label}</strong>
        <span>저장 항목 {current.items.length}개</span>
      </aside>
    </div>
  );
}
