import { useState } from "react";
import { toast } from "sonner";

export default function SonnerSilentModeExample() {
  const [silent, setSilent] = useState(false);
  const [log, setLog] = useState("토스트 채널이 활성화되어 있습니다.");

  function notify() {
    if (silent) {
      setLog("알림을 조용히 기록했습니다.");
      return;
    }
    toast.info("화면에 보이는 알림");
  }

  return (
    <div className="toast-state-card">
      <strong>{silent ? "무음 모드" : "표시 모드"}</strong>
      <span>{log}</span>
      <button className="command-trigger stable-wide" onClick={() => setSilent((value) => !value)} type="button">무음 전환</button>
      <button className="command-trigger stable-wide" onClick={notify} type="button">알림 보내기</button>
    </div>
  );
}
