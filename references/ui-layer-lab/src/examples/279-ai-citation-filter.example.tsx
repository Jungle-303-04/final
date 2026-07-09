import { useState } from "react";

const sources = [
  { value: "workflow.log", label: "워크플로 로그" },
  { value: "diff.patch", label: "패치 차이" },
  { value: "README.md", label: "README 문서" }
];

export default function AiCitationFilterExample() {
  const [source, setSource] = useState("workflow.log");
  const selectedSource = sources.find((item) => item.value === source) ?? sources[0];

  return (
    <div className="sidecar-tabs">
      <div className="ai-chat-card">
        <strong>응답</strong>
        <span aria-live="polite">응답 출처: {selectedSource.label}</span>
      </div>
      <aside className="detail-panel">
        {sources.map((item) => (
          <button
            aria-label={`${item.label} 출처 선택`}
            aria-pressed={source === item.value}
            className={source === item.value ? "row-button selected" : "row-button"}
            key={item.value}
            onClick={() => setSource(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </aside>
    </div>
  );
}
