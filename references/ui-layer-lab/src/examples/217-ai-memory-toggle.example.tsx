import { useState } from "react";

const memories = ["저장소 규칙", "선호 브랜치", "검증 명령"];

export default function AiMemoryToggleExample() {
  const [enabled, setEnabled] = useState(["저장소 규칙"]);

  return (
    <div className="context-chip-card">
      <strong>메모리 컨텍스트</strong>
      <div className="chip-row">
        {memories.map((memory) => (
          <button
            aria-pressed={enabled.includes(memory)}
            className={enabled.includes(memory) ? "active" : ""}
            key={memory}
            onClick={() => setEnabled((items) => (items.includes(memory) ? items.filter((item) => item !== memory) : [...items, memory]))}
            type="button"
          >
            {memory}
          </button>
        ))}
      </div>
      <span>연결된 메모리 {enabled.length}개</span>
    </div>
  );
}
