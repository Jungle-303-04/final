import { useState } from "react";
import { toast } from "sonner";

export default function SonnerDestructiveConfirmExample() {
  const [state, setState] = useState("미리보기 환경이 실행 중입니다.");

  function confirm() {
    toast.warning("미리보기를 삭제할까요?", {
      action: {
        label: "삭제",
        onClick: () => setState("미리보기 환경을 삭제했습니다.")
      }
    });
  }

  return (
    <div className="toast-state-card">
      <strong>{state}</strong>
      <span>위험도가 낮은 확인은 토스트 액션으로 처리합니다.</span>
      <button className="command-trigger stable-wide" onClick={confirm} type="button">미리보기 삭제</button>
    </div>
  );
}
