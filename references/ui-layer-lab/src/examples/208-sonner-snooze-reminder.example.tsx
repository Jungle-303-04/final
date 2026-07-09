import { useState } from "react";
import { toast } from "sonner";

export default function SonnerSnoozeReminderExample() {
  const [reminder, setReminder] = useState("No reminder scheduled.");

  function remind() {
    toast("Review failed run", {
      action: {
        label: "Snooze",
        onClick: () => setReminder("Reminder snoozed for 10 minutes.")
      }
    });
  }

  return (
    <div className="toast-state-card">
      <strong>Run reminder</strong>
      <span>{reminder}</span>
      <button className="command-trigger" onClick={remind}>Show Reminder</button>
    </div>
  );
}
