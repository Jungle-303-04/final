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
      <button aria-checked={toast} className="component-switch" onClick={() => setToast((value) => !value)} role="switch" type="button">
        <span aria-hidden />
        화면 토스트
      </button>
      <button aria-checked={activity} className="component-switch" onClick={() => setActivity((value) => !value)} role="switch" type="button">
        <span aria-hidden />
        활동 로그
      </button>
      <p className="component-muted">토스트 {toast ? "켜짐" : "꺼짐"} / 활동 로그 {activity ? "켜짐" : "꺼짐"}</p>
    </section>
  );
}
