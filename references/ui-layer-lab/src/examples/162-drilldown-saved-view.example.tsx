import { useState } from "react";

const views = {
  Failures: ["visual-smoke", "deploy-preview"],
  Running: ["api-build"],
  Mine: ["target-sync", "docs-check"]
};

export default function DrilldownSavedViewExample() {
  const [view, setView] = useState<keyof typeof views>("Failures");

  return (
    <div className="drill-grid">
      <div className="drawer">
        <div className="segmented-row">
          {Object.keys(views).map((item) => (
            <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item as keyof typeof views)}>
              {item}
            </button>
          ))}
        </div>
        {views[view].map((item) => (
          <button className="row-button" key={item}>{item}</button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{view}</strong>
        <span>{views[view].length} saved items</span>
      </aside>
    </div>
  );
}
