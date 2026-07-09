import { useState } from "react";
import { toast } from "sonner";

export default function SonnerPromiseErrorRecoveryExample() {
  const [status, setStatus] = useState("대기 중");

  function fail() {
    setStatus("실패");
    toast.error("미리보기 배포 실패", {
      description: "복구 액션은 실패한 실행을 계속 표시합니다.",
      action: {
        label: "복구",
        onClick: () => setStatus("복구 대기열 추가")
      }
    });
  }

  return (
    <div className="toast-state-card">
      <strong aria-live="polite">{status}</strong>
      <button className="command-trigger stable-wide" onClick={fail} type="button">실패 시뮬레이션</button>
    </div>
  );
}
