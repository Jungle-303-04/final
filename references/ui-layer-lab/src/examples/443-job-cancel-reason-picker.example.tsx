import { useState } from "react";

const reasons = ["브랜치 오류", "중복 실행", "수동 중지"];

export default function JobCancelReasonPickerExample() {
  const [reason, setReason] = useState("사유 미선택");

  return (
    <div className="animated-tabs-card">
      <div className="animated-tabs-list">
        {reasons.map((item) => <button key={item} onClick={() => setReason(item)} type="button">{item}</button>)}
      </div>
      <div className="animated-tab-panel">
        <strong>{reason}</strong>
        <span>취소 사유가 작업 이벤트에 함께 기록됩니다.</span>
      </div>
    </div>
  );
}
