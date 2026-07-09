import { useState } from "react";
import { toast } from "sonner";

export default function SonnerCommandFeedbackExample() {
  const [feedback, setFeedback] = useState("실행한 명령이 없습니다.");

  function run() {
    setFeedback("명령을 실행했습니다.");
    toast("명령 실행 완료", { description: "활동 센터에서 로그를 열 수 있습니다." });
  }

  return (
    <div className="toast-state-card">
      <strong aria-live="polite">{feedback}</strong>
      <button className="command-trigger stable-wide" onClick={run} type="button">명령 실행</button>
    </div>
  );
}
