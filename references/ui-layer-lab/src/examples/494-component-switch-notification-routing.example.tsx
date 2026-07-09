import { useState } from "react";

export default function ComponentSwitchNotificationRoutingExample() {
  const [toast, setToast] = useState(true);
  const [activity, setActivity] = useState(true);

  return (
    <section className="component-demo">
      <header>
        <strong>알림 채널 스위치</strong>
        <span>화면 토스트와 활동 로그 기록을 분리</span>
      </header>
      <label className="component-switch"><input checked={toast} onChange={(event) => setToast(event.target.checked)} type="checkbox" /><span />화면 토스트</label>
      <label className="component-switch"><input checked={activity} onChange={(event) => setActivity(event.target.checked)} type="checkbox" /><span />활동 로그</label>
      <p className="component-muted">토스트 {toast ? "켜짐" : "꺼짐"} / 활동 로그 {activity ? "켜짐" : "꺼짐"}</p>
    </section>
  );
}
