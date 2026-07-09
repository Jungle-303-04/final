import { useState } from "react";
import { toast } from "sonner";

export default function SonnerConnectionQualityExample() {
  const [quality, setQuality] = useState("양호");

  function degrade() {
    setQuality("저하");
    toast.warning("실시간 업데이트 품질 저하", { description: "폴링 대체 모드가 활성화되었습니다." });
  }

  return (
    <div className="toast-state-card">
      <strong>연결 상태: {quality}</strong>
      <span>실시간 작업 이벤트를 모니터링합니다.</span>
      <button className="command-trigger stable-wide" onClick={degrade} type="button">품질 저하 시뮬레이션</button>
    </div>
  );
}
