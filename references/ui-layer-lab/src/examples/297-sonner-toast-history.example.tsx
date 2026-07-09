import { useState } from "react";
import { toast } from "sonner";

const events = ["가져오기 완료", "타입 검사 시작", "미리보기 배포 완료"];

export default function SonnerToastHistoryExample() {
  const [history, setHistory] = useState<string[]>([]);

  function pushEvent() {
    const next = events[history.length % events.length];
    setHistory((items) => [next, ...items].slice(0, 3));
    toast(next);
  }

  return (
    <div className="toast-state-card">
      <button className="command-trigger stable-wide" onClick={pushEvent} type="button">이벤트 추가</button>
      <div aria-live="polite" className="stack-list toast-history-list">
        {history.length ? history.map((item) => <button key={item} type="button">{item}</button>) : <span>기록된 이벤트가 없습니다.</span>}
      </div>
    </div>
  );
}
