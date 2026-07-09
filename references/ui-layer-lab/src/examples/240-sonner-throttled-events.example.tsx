import { useState } from "react";
import { toast } from "sonner";

export default function SonnerThrottledEventsExample() {
  const [count, setCount] = useState(0);

  function pushEvent() {
    setCount((value) => {
      const next = value + 1;
      toast.info(`이벤트 ${next}개를 묶어 표시합니다`, { id: "event-batch" });
      return next;
    });
  }

  return (
    <div className="toast-state-card">
      <strong>수신 이벤트 {count}개</strong>
      <button className="command-trigger stable-wide" onClick={pushEvent} type="button">이벤트 추가</button>
    </div>
  );
}
