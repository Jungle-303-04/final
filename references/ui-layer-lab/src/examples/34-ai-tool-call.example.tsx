import { useState } from "react";

export default function AiToolCallExample() {
  const [approved, setApproved] = useState(false);

  return (
    <div className="tool-call-card">
      <div>
        <strong>AI가 도구 실행을 요청합니다</strong>
        <span>read_workflow_logs(runId: "2841")</span>
      </div>
      <div className="tool-call-actions">
        <button onClick={() => setApproved(false)} type="button">거부</button>
        <button onClick={() => setApproved(true)} type="button">승인</button>
      </div>
      {approved ? <code>도구 결과: 시각 검사가 라우트 단언에서 실패했습니다.</code> : null}
    </div>
  );
}
