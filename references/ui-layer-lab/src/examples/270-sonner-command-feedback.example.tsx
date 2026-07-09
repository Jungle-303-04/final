import { useState } from "react";
import { toast } from "sonner";

export default function SonnerCommandFeedbackExample() {
  const [feedback, setFeedback] = useState("No command Executiond.");

  function run() {
    setFeedback("Command Executiond.");
    toast("Command Executiond", { description: "Open logs from the activity center." });
  }

  return (
    <div className="toast-state-card">
      <strong>{feedback}</strong>
      <button className="command-trigger" onClick={run}>Run Command</button>
    </div>
  );
}
