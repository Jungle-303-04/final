import { useState } from "react";
import { toast } from "sonner";

export default function SonnerActionTimeoutExample() {
  const [state, setState] = useState("대기 중");

  function show() {
    toast.warning("10초 동안 롤백할 수 있습니다.", {
      action: { label: "롤백", onClick: () => setState("롤백 시작됨") },
      duration: 10000
    });
  }

  return (
    <div className="toast-state-card">
      <strong>{state}</strong>
      <button className="command-trigger stable-wide" onClick={show} type="button">시간 제한 액션 표시</button>
    </div>
  );
}
