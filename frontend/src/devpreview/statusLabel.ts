// UI-PHASE2-001 P1(9): 관측된 영문 상태/이벤트 토큰을 사용자 친화 한글로 표기한다.
// 매핑에 없는 값은 원문을 그대로 반환한다(지어내지 않음 — honest).

const STATUS_KO: Record<string, string> = {
  // 연결/헬스
  healthy: "정상",
  ok: "정상",
  ready: "준비됨",
  online: "연결됨",
  connected: "연결됨",
  degraded: "저하",
  warning: "주의",
  warn: "주의",
  pending: "대기",
  provisioning: "예약 중",
  progressing: "진행 중",
  critical: "위험",
  error: "오류",
  failed: "실패",
  failure: "실패",
  unhealthy: "비정상",
  notready: "준비 안 됨",
  "not-ready": "준비 안 됨",
  offline: "연결 끊김",
  disconnected: "연결 끊김",
  cordoned: "차단됨",
  unknown: "관측 안 됨",
  // 파드 phase
  running: "실행 중",
  succeeded: "완료",
  completed: "완료",
  terminating: "종료 중",
  crashloopbackoff: "재시작 반복",
  imagepullbackoff: "이미지 수신 실패",
  errimagepull: "이미지 수신 실패",
  containercreating: "컨테이너 생성 중",
  // 이벤트/인시던트
  incident_resolved: "인시던트 해결",
  incident_open: "인시던트 발생",
  incident_detected: "인시던트 감지",
  resolved: "해결됨",
  acknowledged: "승인됨",
  open: "발생",
  active: "활성",
  // 배송/동기화
  synced: "동기화됨",
  outofsync: "동기화 안 됨",
  drift: "드리프트",
};

/** 상태 토큰(단일 단어/스네이크)을 한글로. 매핑에 없으면 원문 유지. */
export function statusLabel(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "관측 안 됨";
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return STATUS_KO[key] ?? STATUS_KO[key.replace(/_/g, "")] ?? raw;
}

/** 상태 토큰이 위험/실패 계열인지(색상 판정용, 지어내지 않고 관측값 기반). */
export function isCriticalStatus(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return /crit|fail|unhealthy|crashloop|imagepull|error|offline|disconnect|notready|not-ready/i.test(raw);
}
