import { toast } from "sonner";
import { useState } from "react";

export default function SonnerActivityHistoryFeedExample() {
  const [events, setEvents] = useState(["opened page"]);

  function push() {
    const next = `event ${events.length + 1}`;
    setEvents((items) => [next, ...items]);
    toast(next);
  }

  return (
    <div className="history-stack">
      <button className="command-trigger" onClick={push}>Push Toast Event</button>
      {events.slice(0, 3).map((event) => <span key={event}>{event}</span>)}
    </div>
  );
}
