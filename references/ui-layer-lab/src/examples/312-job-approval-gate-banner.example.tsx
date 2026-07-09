import { useState } from "react";

export default function JobApprovalGateBannerExample() {
  const [approved, setApproved] = useState(false);

  return (
    <div className={approved ? "sla-card gate-card approved" : "sla-card gate-card"}>
      <strong>{approved ? "배포 승인 완료" : "승인 필요"}</strong>
      <span>{approved ? "운영 배포 게이트가 열렸습니다." : "게시 전에 검토자 승인이 필요합니다."}</span>
      <button className="command-trigger stable-wide" onClick={() => setApproved(true)} type="button">게이트 승인</button>
    </div>
  );
}
