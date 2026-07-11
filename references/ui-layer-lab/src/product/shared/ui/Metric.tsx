export function Metric({ label, value, tone = "neutral", note }: {
  label: string;
  value: string | number;
  tone?: "neutral" | "critical" | "warning";
  note?: string;
}) {
  return (
    <div className="metric" data-tone={tone}>
      <span className="metric__label">{label}</span>
      <strong className="metric__value">{value}</strong>
      {note ? <span className="metric__note">{note}</span> : null}
    </div>
  );
}
