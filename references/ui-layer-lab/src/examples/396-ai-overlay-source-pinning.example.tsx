import { useState } from "react";

const sources = ["워크플로 로그", "차이 조각", "패키지 파일"];

export default function AiOverlaySourcePinningExample() {
  const [pinned, setPinned] = useState("워크플로 로그");

  return (
    <div className="selection-demo">
      <p>AI 답변이 고정된 근거 소스를 사용합니다.</p>
      <div className="selection-toolbar">
        {sources.map((source) => (
          <button className={pinned === source ? "active" : ""} key={source} onClick={() => setPinned(source)} type="button">
            {source}
          </button>
        ))}
      </div>
      <strong>{pinned} 고정됨</strong>
    </div>
  );
}
