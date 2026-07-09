import { useState } from "react";
import { toast } from "sonner";

export default function SonnerMutedChannelExample() {
  const [muted, setMuted] = useState(false);
  const [log, setLog] = useState("무음 이벤트가 없습니다.");

  function notify() {
    if (muted) {
      setLog("활동 로그에 저장했습니다.");
      return;
    }
    toast.success("토스트 채널 표시");
    setLog("토스트를 표시했습니다.");
  }

  return (
    <div className="toast-state-card">
      <button aria-pressed={muted} className="command-trigger stable-wide" onClick={() => setMuted((value) => !value)} type="button">
        {muted ? "무음 해제" : "무음 전환"}
      </button>
      <button className="command-trigger stable-wide" onClick={notify} type="button">알림 보내기</button>
      <span aria-live="polite">{log}</span>
    </div>
  );
}
