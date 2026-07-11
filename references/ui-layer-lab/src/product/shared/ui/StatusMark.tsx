import type { FleetHealth } from "../../api";

const statusLabels: Record<FleetHealth, string> = {
  healthy: "정상",
  warning: "주의",
  critical: "위험",
  stale: "오래됨",
  unknown: "미확인",
};

export function StatusMark({ health }: { health: FleetHealth }) {
  return (
    <span className="status-mark" data-health={health}>
      <span className="status-mark__dot" aria-hidden="true" />
      <span>{statusLabels[health]}</span>
    </span>
  );
}

export function healthLabel(health: FleetHealth): string {
  return statusLabels[health];
}
