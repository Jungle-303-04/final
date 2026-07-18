// ── 데모 액션 버스 — 임베드된 서피스(위저드·AI)가 셸에 실제 결과를 알린다 ──
// 셸은 이 이벤트로 토스트·알림 센터를 갱신한다. 팝업 흉내가 아니라 상태가 실제로 이어진다.
export const ACTION_EVENT = "opsia:demo-action";
export type DemoAction = { kind: "alert_rule" | "connect"; title: string; body: string };
export const emitAction = (a: DemoAction) => window.dispatchEvent(new CustomEvent(ACTION_EVENT, { detail: a }));
export const onAction = (fn: (a: DemoAction) => void) => {
  const h = (e: Event) => fn((e as CustomEvent<DemoAction>).detail);
  window.addEventListener(ACTION_EVENT, h);
  return () => window.removeEventListener(ACTION_EVENT, h);
};
