const events = ["Pull started", "Objects received", "Deltas resolved", "Workspace checked", "Ready"];

export default function AnimatedTimelineExample() {
  return (
    <div className="animated-timeline">
      {events.map((event, index) => (
        <div className="timeline-step" style={{ animationDelay: `${index * 180}ms` }} key={event}>
          <span>{index + 1}</span>
          <strong>{event}</strong>
        </div>
      ))}
    </div>
  );
}
