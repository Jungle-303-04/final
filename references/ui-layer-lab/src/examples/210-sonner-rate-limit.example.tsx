import { useState } from "react";
import { toast } from "sonner";

export default function SonnerRateLimitExample() {
  const [remaining, setRemaining] = useState(3);

  function run() {
    setRemaining((value) => {
      if (value <= 1) {
        toast.error("실행 제한에 도달했습니다", { description: "현재 실행이 끝난 뒤 다시 시도하세요." });
        return 0;
      }
      toast.info(`남은 시도 ${value - 1}회`);
      return value - 1;
    });
  }

  return (
    <div className="toast-state-card">
      <strong>남은 시도 {remaining}회</strong>
      <button className="command-trigger stable-wide" onClick={run} type="button">액션 실행</button>
    </div>
  );
}
