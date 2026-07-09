const statuses = [
  { label: "성공", tone: "green" },
  { label: "대기", tone: "blue" },
  { label: "실패", tone: "red" },
  { label: "수동 승인", tone: "orange" }
];

export default function ComponentBadgeStatusStackExample() {
  return (
    <section className="component-demo">
      <header>
        <strong>상태 배지 묶음</strong>
        <span>작은 메타데이터를 일관된 색상과 크기로 표시</span>
      </header>
      <div className="badge-stack">
        {statuses.map((status) => (
          <span className={status.tone} key={status.label}>{status.label}</span>
        ))}
      </div>
    </section>
  );
}
