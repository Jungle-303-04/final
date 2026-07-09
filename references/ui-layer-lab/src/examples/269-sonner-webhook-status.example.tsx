import { useState } from "react";
import { toast } from "sonner";

export default function SonnerWebhookStatusExample() {
  const [sent, setSent] = useState(0);

  function ping() {
    setSent((value) => value + 1);
    toast.success("웹훅 전달됨");
  }

  return (
    <div className="toast-state-card">
      <strong>{sent}개 웹훅 전송됨</strong>
      <button className="command-trigger stable-wide" onClick={ping} type="button">웹훅 보내기</button>
    </div>
  );
}
