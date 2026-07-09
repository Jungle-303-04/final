import { toast } from "sonner";
import { useState } from "react";

const channels = ["info", "warning", "error"] as const;

export default function SonnerPriorityChannelExample() {
  const [channel, setChannel] = useState<(typeof channels)[number]>("info");

  function notify(next: (typeof channels)[number]) {
    setChannel(next);
    if (next === "error") toast.error("Deploy blocked");
    if (next === "warning") toast.warning("Deploy needs review");
    if (next === "info") toast.info("Deploy is queued");
  }

  return (
    <div className="animated-tabs-card">
      <div className="animated-tabs-list">
        {channels.map((item) => (
          <button className={channel === item ? "active" : ""} key={item} onClick={() => notify(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="animated-tab-panel">
        <strong>{channel}</strong>
        <span>Toast priority maps to a product channel</span>
      </div>
    </div>
  );
}
