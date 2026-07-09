import { useState } from "react";

const events = [
  { id: "pull", time: "15:42", title: "Pull completed", detail: "3 commits fetched from dev." },
  { id: "build", time: "15:44", title: "Build passed", detail: "Bundle generated successfully." },
  { id: "visual", time: "15:45", title: "Visual smoke failed", detail: "Expected route was not mounted." },
  { id: "ai", time: "15:46", title: "AI summary ready", detail: "Likely caused by removed dev route." }
];

export default function TimelineDrilldownExample() {
  const [selected, setSelected] = useState(events[2]);

  return (
    <div className="timeline-drill">
      <div className="timeline-list">
        {events.map((event) => (
          <button className={event.id === selected.id ? "active" : ""} key={event.id} onClick={() => setSelected(event)}>
            <time>{event.time}</time>
            <span>{event.title}</span>
          </button>
        ))}
      </div>
      <div className="detail-panel">
        <strong>{selected.title}</strong>
        <span>{selected.detail}</span>
      </div>
    </div>
  );
}
