import { useState } from "react";

const cards = ["명령", "오버레이", "작업", "드릴다운"];

export default function AnimatedLayoutSwitchExample() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="layout-switch-demo">
      <button className="command-trigger stable-wide" onClick={() => setExpanded((value) => !value)} type="button">
        {expanded ? "간단히" : "펼치기"}
      </button>
      <div className={`layout-switch-grid ${expanded ? "expanded" : ""}`}>
        {cards.map((card) => (
          <article key={card}>
            <strong>{card}</strong>
            <span>{expanded ? "상세 상태와 보조 액션을 함께 보여줍니다." : "접힘"}</span>
          </article>
        ))}
      </div>
    </div>
  );
}
