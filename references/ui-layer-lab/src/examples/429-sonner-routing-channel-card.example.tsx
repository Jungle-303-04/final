import { toast } from "sonner";
import { useState } from "react";

const channels = ["toast", "activity"];

export default function SonnerRoutingChannelCardExample() {
  const [channel, setChannel] = useState("toast");
  const [activity, setActivity] = useState("No silent event");

  function notify() {
    if (channel === "toast") toast.info("Visible toast channel");
    else setActivity("Silent activity channel");
  }

  return (
    <div className="animated-tabs-card">
      <div className="animated-tabs-list">
        {channels.map((item) => <button className={channel === item ? "active" : ""} key={item} onClick={() => setChannel(item)}>{item}</button>)}
      </div>
      <button className="command-trigger" onClick={notify}>Notify</button>
      <div className="animated-tab-panel"><strong>{activity}</strong></div>
    </div>
  );
}
