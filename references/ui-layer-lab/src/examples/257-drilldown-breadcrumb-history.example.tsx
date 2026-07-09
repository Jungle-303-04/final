import { useState } from "react";

const path = ["워크스페이스", "저장소", "워크플로", "작업"];

export default function DrilldownBreadcrumbHistoryExample() {
  const [index, setIndex] = useState(3);

  return (
    <div className="breadcrumb-drill">
      <nav aria-label="드릴다운 경로">
        {path.slice(0, index + 1).map((item, itemIndex) => (
          <button
            aria-current={itemIndex === index ? "page" : undefined}
            aria-pressed={itemIndex === index}
            key={item}
            onClick={() => setIndex(itemIndex)}
            type="button"
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="detail-panel">
        <strong>{path[index]}</strong>
        <span aria-live="polite">깊이 {index + 1}</span>
      </div>
    </div>
  );
}
