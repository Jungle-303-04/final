import { useState } from "react";
import { toast } from "sonner";

export default function SonnerNetworkReconnectExample() {
  const [online, setOnline] = useState(true);

  function toggle() {
    setOnline((value) => {
      toast(value ? "오프라인 상태입니다" : "연결이 복구되었습니다", {
        description: value ? "백그라운드 작업이 일시 정지됩니다." : "대기 중인 작업을 다시 시작합니다."
      });
      return !value;
    });
  }

  return (
    <div className={`pause-card ${online ? "" : "paused"}`}>
      <strong>{online ? "온라인" : "오프라인"}</strong>
      <span>{online ? "실시간 업데이트 활성화됨." : "재연결 대기 중."}</span>
      <button className="command-trigger stable-wide" onClick={toggle} type="button">{online ? "오프라인 전환" : "다시 연결"}</button>
    </div>
  );
}
