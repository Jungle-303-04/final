import { useState } from "react";

export default function DrilldownPermissionDeniedBranchExample() {
  const [requested, setRequested] = useState(false);

  return (
    <div className="approval-dialog">
      <strong>{requested ? "접근 요청됨" : "권한 필요"}</strong>
      <span>프로덕션 로그 상세는 승인 후 열람할 수 있습니다.</span>
      <button className="command-trigger stable-wide" onClick={() => setRequested(true)} type="button">접근 요청</button>
    </div>
  );
}
