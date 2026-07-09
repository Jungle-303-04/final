import { useState } from "react";

export default function AiHumanCheckpointExample() {
  const [approved, setApproved] = useState(false);

  return (
    <div className={approved ? "approval-dialog approved-inline" : "approval-dialog"}>
      <strong>{approved ? "사람 승인 완료" : "사람 검토 지점"}</strong>
      <span>AI가 추적 중인 파일을 편집하려고 합니다.</span>
      <button className="command-trigger stable-wide" onClick={() => setApproved(true)} type="button">승인</button>
    </div>
  );
}
