import { useState } from "react";
import { toast } from "sonner";

export default function SonnerSessionExpiringExample() {
  const [status, setStatus] = useState("세션 활성");

  function warn() {
    toast.warning("세션이 곧 만료됩니다", {
      action: {
        label: "연장",
        onClick: () => setStatus("세션 연장됨")
      }
    });
  }

  return (
    <div className="toast-state-card">
      <strong>{status}</strong>
      <button className="command-trigger stable-wide" onClick={warn} type="button">세션 경고</button>
    </div>
  );
}
