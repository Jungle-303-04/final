import { useState } from "react";

export default function AiErrorRecoveryPanelExample() {
  const [state, setState] = useState("도구 호출 실패: 미리보기 URL이 없습니다.");

  return (
    <div className="retry-card failed">
      <strong>AI 복구</strong>
      <span>{state}</span>
      <button className="command-trigger stable-wide" onClick={() => setState("대체 URL을 포함한 복구 프롬프트를 대기열에 추가했습니다.")} type="button">
        컨텍스트로 재시도
      </button>
    </div>
  );
}
