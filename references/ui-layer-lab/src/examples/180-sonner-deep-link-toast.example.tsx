import { useState } from "react";
import { toast } from "sonner";

export default function SonnerDeepLinkToastExample() {
  const [route, setRoute] = useState("/runs");

  function openToast() {
    toast("Run finished", {
      action: {
        label: "Open",
        onClick: () => setRoute("/runs/run-417/logs")
      }
    });
  }

  return (
    <div className="toast-state-card">
      <strong>{route}</strong>
      <span>Toast action updates the active route preview.</span>
      <button className="command-trigger" onClick={openToast}>Show Toast</button>
    </div>
  );
}
