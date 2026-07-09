const events = ["가져오기 시작", "객체 수신", "델타 해석", "작업공간 검사", "준비 완료"];

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
