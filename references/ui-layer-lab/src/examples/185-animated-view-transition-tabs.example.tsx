import { useState } from "react";

const views = {
  Timeline: ["Queued", "Pulled", "Built"],
  Files: ["App.tsx", "styles.css", "registry.ts"],
  Review: ["2 comments", "1 suggestion", "0 blockers"]
};

export default function AnimatedViewTransitionTabsExample() {
  const [view, setView] = useState<keyof typeof views>("Timeline");

  return (
    <div className="route-transition">
      <div className="segmented-row">
        {Object.keys(views).map((item) => (
          <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item as keyof typeof views)}>
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
