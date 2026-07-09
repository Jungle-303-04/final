const events = [
  ["15:42:10", "git pull started"],
  ["15:42:13", "received objects"],
  ["15:42:20", "workspace checked"],
  ["15:42:28", "visual smoke failed"]
];

export default function JobActivityFeedExample() {
  return (
    <div className="activity-feed">
      {events.map(([time, event]) => (
        <div className="activity-row" key={event}>
          <time>{time}</time>
          <span>{event}</span>
        </div>
      ))}
    </div>
  );
}
