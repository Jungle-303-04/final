import { useState } from "react";
import { toast } from "sonner";

export default function SonnerWebhookStatusExample() {
  const [sent, setSent] = useState(0);

  function ping() {
    setSent((value) => value + 1);
    toast.success("Webhook delivered");
  }

  return (
    <div className="toast-state-card">
      <strong>{sent} webhooks sent</strong>
      <button className="command-trigger" onClick={ping}>Send Webhook</button>
    </div>
  );
}
