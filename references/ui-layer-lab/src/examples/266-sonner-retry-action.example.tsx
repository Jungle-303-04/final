import { useState } from "react";
import { toast } from "sonner";

export default function SonnerRetryActionExample() {
  const [state, setState] = useState("배포 실패");

  function show() {
    toast.error("배포 실패", {
      action: {
        label: "재시도",
        onClick: () => setState("재시도 대기열에 추가됨")
      }
    });
  }

  return (
    <div className="toast-state-card">
      <strong>{state}</strong>
      <button className="command-trigger stable-wide" onClick={show} type="button">재시도 토스트 표시</button>
    </div>
  );
}
