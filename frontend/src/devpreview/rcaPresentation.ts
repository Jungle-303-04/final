const MISSING_EVIDENCE_ACTIONS: Record<string, string> = {
  change_approval_history: "Git PR·배포 승인 기록에서 변경 승인 여부를 확인하세요.",
  probe_path_failure_signal: "애플리케이션의 실제 health 경로와 readiness probe 경로가 일치하는지 확인하세요.",
  probe_port_failure_signal: "애플리케이션의 실제 수신 포트와 readiness probe 포트가 일치하는지 확인하세요.",
  probe_failure_signal: "readiness probe의 경로·포트와 애플리케이션 응답 상태를 확인하세요.",
  pvc_unbound_event: "PVC가 Bound 상태인지와 스토리지 프로비저닝 이벤트를 확인하세요.",
  pvc_unbound_mount_signal: "PVC 바인딩 상태와 볼륨 마운트 실패 이벤트를 확인하세요.",
  untolerated_taint_signal: "노드 taint와 Pod toleration 설정이 일치하는지 확인하세요.",
};

/** Turn internal RCA check identifiers into an operator-facing next action. */
export function missingEvidenceAction(item: string): string {
  const normalized = item.trim().toLowerCase();
  if (normalized === "변경 승인 이력") {
    return MISSING_EVIDENCE_ACTIONS.change_approval_history;
  }
  const signal = normalized.startsWith("signal:")
    ? normalized.slice("signal:".length)
    : normalized;
  const action = MISSING_EVIDENCE_ACTIONS[signal];
  if (action) return action;
  if (normalized.startsWith("signal:")) {
    return "원인 확정에 필요한 추가 진단 신호를 수집해 확인하세요.";
  }
  const readable = item.trim().replace(/[_:.]+/gu, " ").replace(/\s+/gu, " ");
  return readable ? `${readable}을 확인하세요.` : "추가 진단 근거를 확인하세요.";
}
