import { useState } from "react";
import { toast } from "sonner";

export default function SonnerSnoozeReminderExample() {
  const [reminder, setReminder] = useState("예약된 알림이 없습니다.");

  function remind() {
    toast("실패한 실행 검토", {
      action: {
        label: "미루기",
        onClick: () => setReminder("알림을 10분 뒤로 미뤘습니다.")
      }
    });
  }

  return (
    <div className="toast-state-card">
      <strong>실행 알림</strong>
      <span>{reminder}</span>
      <button className="command-trigger stable-wide" onClick={remind} type="button">알림 표시</button>
    </div>
  );
}
