// ── Opsia 데모 디자인 토큰 — 단일 소스 ─────────────────────────────
// 철학: Vercel Geist(의미 토큰·차분한 표면·정보 우선) × Apple HIG(컬러는 데이터에만·헤어라인·스프링 모션)
// 규칙: 데모 화면은 색·타이포·모션 값을 여기서만 가져온다. 컴포넌트 안 하드코딩 금지.

// 표면·잉크 (Geist: background / surface / border, 3단 잉크)
export const UI = {
  bg: "#FAFAFC",     // 페이지 배경
  card: "#FFFFFF",   // 표면
  line: "#E9EAEE",   // 헤어라인 (구분 1순위 — 그림자보다 먼저)
  line2: "#F1F2F5",  // 보조 헤어라인
  ink: "#111318",    // 본문·제목
  ink2: "#5F6570",   // 보조 텍스트
  ink3: "#9AA0AA",   // 라벨·자리표시
} as const;

// 액센트 — 선택·포커스·링크 전용 (상태 표현에 쓰지 않는다)
export const BLUE = "#0A84FF";

// 상태 팔레트 (Apple 시스템 컬러 계열) — 상태 외 용도 금지
export const HP = {
  ok: "#30D158",
  warn: "#FFB340",
  crit: "#FF5F55",
  pending: "#D9DCE1",
  ghost: "#F3F4F6",
} as const;
// 토폴로지 등 상태 별칭 — 반드시 HP와 같은 값
export const ST = { ok: HP.ok, warn: HP.warn, crit: HP.crit } as const;

// 상태 틴트 (배경/보더 짝) — Badge·칩·경고 박스 공용
export const TINT = {
  ok:   { fg: "#1F9D4D", bg: "#EDFAF1", bd: "#C9EAD4" },
  warn: { fg: "#B25A00", bg: "#FFF8EF", bd: "#F3D8B7" },
  crit: { fg: "#C43028", bg: "#FFF3F2", bd: "#F5CFCC" },
  blue: { fg: "#0A6CFF", bg: "#EDF4FF", bd: "#CFE1FB" },
  purple: { fg: "#8250DF", bg: "#F6F1FE", bd: "#E3D5FA" },
  gray: { fg: "#5F6570", bg: "#F4F5F7", bd: "#E4E6EA" },
} as const;

// 타이포 — 한 단계 큰 애플 스케일 (500 웨이트 금지 → 600)
export const SANS = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard", "Apple SD Gothic Neo", "Helvetica Neue", sans-serif`;
export const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace";
export const TYPE = {
  caption: 11, label: 12, body: 13, bodyStrong: 14,
  title3: 15.5, title2: 17, title1: 21,
} as const;

// 모션 — 용도별 스프링 3종 (임의 duration 금지)
export const SOFT = { type: "spring", bounce: 0.12, visualDuration: 0.32 } as const;   // 요소 등장·탭 인디케이터
export const SPRING = { type: "spring", bounce: 0.16, visualDuration: 0.5 } as const;  // 카드·위젯 레이아웃
export const PAGE = { type: "spring", bounce: 0.08, visualDuration: 0.55 } as const;   // 뷰(페이지) 전환
export const EASE_DRAW = [0.22, 1, 0.36, 1] as const;                                   // 차트 선 드로잉

// 엘리베이션 — 헤어라인 우선, 그림자는 떠 있는 것(팝오버·오버레이)에만
export const ELEV = {
  hover: "0 10px 26px -20px rgba(17,19,24,0.16)",
  pop: "0 18px 50px -18px rgba(17,19,24,0.28)",
  overlay: "0 28px 70px -24px rgba(17,19,24,0.38)",
} as const;

// 라운드 스케일 (4px 그리드)
export const RADIUS = { tile: 3, chip: 6, control: 9, card: 14, panel: 16, sheet: 18 } as const;

// 시연 스케일 — 데모는 멀리서도 읽혀야 한다 (기본 1.25 = 별도 확대 없이 발표 가독)
export const PRESENT_SCALE = 1.25;
