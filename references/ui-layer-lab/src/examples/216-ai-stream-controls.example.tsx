import { useState } from "react";

export default function AiStreamControlsExample() {
  const [paused, setPaused] = useState(false);
  const text = paused ? "스트리밍이 일시 정지되었습니다." : "실패한 배포의 원인을 생성하는 중...";

  return (
    <div className="ai-chat-card">
      <strong>어시스턴트 스트림</strong>
      <span>{text}</span>
      <button aria-pressed={paused} className="command-trigger stable-wide" onClick={() => setPaused((value) => !value)} type="button">
        {paused ? "다시 시작" : "일시 정지"}
      </button>
    </div>
  );
}
