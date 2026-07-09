import { useState } from "react";

export default function AnimatedSwipeCommandCardExample() {
  const [archived, setArchived] = useState(false);

  return (
    <div className="swipe-command-stage">
      <button className="command-trigger" onClick={() => setArchived((value) => !value)}>{archived ? "Restore" : "Archive"}</button>
      <section className={archived ? "swipe-command-card archived" : "swipe-command-card"}>
        <strong>Review failed run</strong>
        <span>{archived ? "Archived" : "Ready for action"}</span>
      </section>
    </div>
  );
}
