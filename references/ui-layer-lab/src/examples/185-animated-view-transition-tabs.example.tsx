import { useState } from "react";

const views = {
  타임라인: ["대기열 등록", "변경 가져옴", "빌드 완료"],
  파일: ["App.tsx", "styles.css", "registry.ts"],
  검토: ["댓글 2개", "제안 1개", "차단 0개"]
};

export default function AnimatedViewTransitionTabsExample() {
  const [view, setView] = useState<keyof typeof views>("타임라인");

  return (
    <div className="route-transition">
      <div className="segmented-row">
        {Object.keys(views).map((item) => (
          <button aria-pressed={view === item} className={view === item ? "active" : ""} key={item} onClick={() => setView(item as keyof typeof views)} type="button">
            {item}
          </button>
        ))}
      </div>
      <section key={view}>
        <strong>{view}</strong>
        {views[view].map((item) => <span key={item}>{item}</span>)}
      </section>
    </div>
  );
}
