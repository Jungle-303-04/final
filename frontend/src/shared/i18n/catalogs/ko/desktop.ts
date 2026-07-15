import type { DesktopMessageKey } from "../../keys/desktop";

export const desktopKo = {
  "desktop.localTerminal.open": "로컬 터미널 열기",
  "desktop.localTerminal.title": "로컬 터미널",
  "desktop.localTerminal.description": "이 데스크톱 기기에서만 실행되며 서버를 거치지 않습니다.",
  "desktop.localTerminal.connecting": "로컬 셸을 시작하는 중…",
  "desktop.localTerminal.connected": "연결됨",
  "desktop.localTerminal.ended": "셸 종료됨",
  "desktop.localTerminal.failed": "로컬 터미널 실패",
  "desktop.localTerminal.reconnect": "새 셸 시작",
  "desktop.localTerminal.close": "로컬 터미널 닫기",
  "desktop.localTerminal.shell": "셸: {shell}",
  "desktop.localTerminal.unavailable": "이 환경에서는 로컬 터미널을 사용할 수 없습니다.",
} satisfies Record<DesktopMessageKey, string>;
