# Opsia 디자인 가이드 — demo-freeze-v3 기준 (단일 정답)

> **지위**: 이 문서는 제품 프론트엔드의 유일한 디자인 기준이다. 이전의 모든 디자인 관련
> 서술(과거 스타일 절·레퍼런스 관례 문서)과 상충하면 **이 문서가 우선하며, 상충 서술은 폐기된 것으로 본다.**
> 시각 정답의 원본은 demo 저장소 태그 `demo-freeze-v3`(frontend/src/devpreview/theme.ts + 각 서피스)이고,
> 결정 근거는 OPSIA-MASTER-SPEC D17~D22다. 이 가이드와 데모가 다르면 데모(태그)가 정답이다.

## 1. 철학
Vercel Geist(의미 토큰·차분한 표면·정보 우선) × Apple HIG(컬러는 데이터에만·헤어라인·스프링 모션).
장식이 아니라 정보가 주인공이다. 색은 상태·데이터에만 쓰고, 구분은 그림자보다 헤어라인이 먼저다.

## 2. 토큰 매핑 — 데모(theme.ts) ↔ 제품(tokens.css)
| 데모 토큰 | 값 | 제품 CSS 변수 |
|---|---|---|
| UI.bg | #FAFAFC | --background |
| UI.bg2 | #FBFBFD | --background-subtle |
| UI.card | #FFFFFF | --card, --popover, --sidebar |
| UI.line | #E9EAEE | --border, --input |
| UI.line2 | #F1F2F5 | --border-subtle, --muted |
| UI.ink / ink2 / ink3 | #111318 / #5F6570 / #9AA0AA | --foreground / --muted-foreground / --caption-foreground |
| BLUE | #0A84FF | --primary, --ring, --sidebar-primary |
| BLUE2 | #5AC8FA | --brand-accent |
| LINE3 / INK4 | #DADDE3 / #C6CAD1 | --border-hover / --foreground-idle |
| INSET / MARK | #EEF0F4 / #FFF1B8 | --surface-inset / --search-highlight |
| GLASS | rgba(246,247,250,.86) | --glass-background |
| HP.ok / warn / crit | #30D158 / #FFB340 / #FF5F55 | --status-healthy / --status-warning / --destructive |
| 보라(구성) | #8250DF | --status-stale |
| IDENT teal / indigo / jade / ruby | #0FA3B1 / #4C6EF5 / #12B5A5 / #DC382C | --identity-teal / --identity-indigo / --identity-jade / --identity-ruby |
| CODE.bg/fg | #0F1219 / #D6DBE5 | --code-background / --code-foreground |
| 차트 범주 | BLUE·ok·warn·보라·틸(#0FA3B1) | --chart-1~5 |

TINT는 아래 7개 삼중항을 축약 없이 제품 토큰으로 보존한다. 상태 원색에 임의 alpha를
합성하지 않고 공용 `StatusPill`·`TintChip`·`Badge`가 이 변수만 소비한다.

| 데모 TINT | fg / bg / bd | 제품 CSS 변수 |
|---|---|---|
| ok | #1F9D4D / #EDFAF1 / #C9EAD4 | --tint-ok-fg / --tint-ok-bg / --tint-ok-border |
| warn | #B25A00 / #FFF8EF / #F3D8B7 | --tint-warn-fg / --tint-warn-bg / --tint-warn-border |
| crit | #C43028 / #FFF3F2 / #F5CFCC | --tint-crit-fg / --tint-crit-bg / --tint-crit-border |
| blue | #0A6CFF / #EDF4FF / #CFE1FB | --tint-blue-fg / --tint-blue-bg / --tint-blue-border |
| purple | #8250DF / #F6F1FE / #E3D5FA | --tint-purple-fg / --tint-purple-bg / --tint-purple-border |
| gray | #5F6570 / #F4F5F7 / #E4E6EA | --tint-gray-fg / --tint-gray-bg / --tint-gray-border |
| lime | #4D7C0F / #F3FAE7 / #DDF0BB | --tint-lime-fg / --tint-lime-bg / --tint-lime-border |

외부 서비스 아이덴티티는 `shared/ui/brand/brand.css` 한 곳만 소유한다. GitHub는
`#24292F`, AWS 타일은 `#FF9900 → #F76F00`이며 페이지 안에 다시 쓰지 않는다.

- **금지**: 토큰 정의 파일 밖 hex·rgba 리터럴. 알파는 Tailwind 알파 문법(`foreground/[0.07]`)이나 토큰 파생만.

## 3. 타이포 — TYPE ↔ --type-*
micro 10.5 · caption 11 · caption2 11.5 · label 12 · label2 12.5 · body 13 · bodyStrong 14 ·
title3 15.5 · title2 17 · heading 18 · title1 21 · kpi 25 (px 기준, 제품은 rem 변환 완료).
- 숫자는 항상 `font-mono tabular-nums`. 강조 숫자는 bold + foreground, 라벨은 muted 계열.
- 이 스케일 밖 fontSize 신설 금지. 500 웨이트 금지(600을 쓴다).

## 4. 라운드·간격
tile 3 · chip/badge 5~6 · control 9 · card 14 · **클러스터/큰 카드 16** · panel 16 · sheet 18 (px).
카드 패딩 15~16, 카드 사이 gap 14, 섹션 gap 16. 4px 그리드 정렬.

## 5. 모션 (D17)
- 스프링 3종만: SOFT(등장·탭 인디케이터, bounce .12/vd .32) · SPRING(카드·레이아웃, .16/.5) · PAGE(뷰 전환, .08/.55).
  제품 등가: `MOTION_SPRING.soft/spring/page`와 --motion-soft/spring/page.
- duration 리터럴은 DUR 화이트리스트만: micro .12 / fade .18 / draw .85 / **meter 1.2(게이지 충전)** / count 1.4.
  제품 등가: `MOTION_TWEEN.micro/fade/draw/meter/count`와 --motion-micro/fade/draw/meter/count.
- EASE_DRAW `[.22,1,.36,1]`은 `EASE_DRAW`와 --ease-draw만 소비한다. `motion/react` 직접 import는
  `src/motion` 경계 안에 두고 페이지는 `MeterFill` 등 공용 모션 경계를 사용한다.
- 리스트 등장 stagger: 행 0.04~0.05s, 최대 8항목까지만 지연.
- 서피스 전환 시 스크롤 최상단 초기화 필수.

## 6. 부품 문법 (원본: demo 각 컴포넌트)
- **클러스터 카드**: 라운드16 · 헤더[30px 그라디언트 프로바이더 타일 + mono title3 이름 + prod 배지 + 우측 상태 pill] ·
  카운트 줄(라벨 muted + **bold mono 숫자**, 장애는 destructive, 0/미상은 표기 생략) ·
  CPU/MEM 게이지(34px micro 라벨 · 5px 트랙 foreground/7% · 임계 75 warn/90 crit · meter 1.2s 충전 · 38px % mono bold) ·
  hover: --border-hover + --elevation-hover. 값은 #DADDE3 + `0 10px 26px -20px rgba(17,19,24,.16)`.
- **상태 pill**: tint fg/bg/bd 3종 세트(ok·warn·crit·info)만. 장애 집계 pill은 crit 원색 배경+흰 글자.
- **요약 칩 줄**: 집계까지만(클러스터·노드·파드·OutOfSync n·장애 n). 개별 리소스 나열 금지.
- **WidgetFrame**: 제목 body bold + ⓘ툴팁 + 접기 + "전체 보기" 딥링크(실 목적지만). 편집=카드 전체 드래그(파란 점선 보더), 버튼식 이동 금지.
- **홈 보드**: 4칸 그리드 + dense, 스팬 [1,1,2 / 1,2,1 / 4], 같은 행 높이 stretch 통일, 기본 배치 빈칸 0.
- **표**: 헤더 micro 대문자 자간 .05em + bg2, 행 하단 line2 헤어라인, 행 등장 SOFT+stagger, 셀 ellipsis.
- **차트**: shadcn charts(Recharts) + --chart-* 주입만. 손수 SVG 차트 신설 금지(데모 SVG는 사양 원본일 뿐).
- **게이지 3종만**: MiniBar(5px)·SlotMatrix·RingGauge(상세 개요 한정). 합성 점수 금지.

## 7. 어휘 (D22)
인프라·쿠버네티스·트래픽(리소스 3관점) / 이슈(구 인시던트) / GitOps(배포 탭) / 워크플로우 /
알림·AI 대화(주 내비 내역 서피스). 전 표면·문서·테스트 동일 표기.

## 8. 완료 정의(검수 게이트)
서피스 "완료"는 다음 전부를 충족할 때만: ① demo-freeze-v3와 나란히 스크린샷 대조(1440)
② 표시 숫자 교차 검증 ③ 1280~1920 리사이즈에서 줄바꿈·오버플로 0 ④ 스크롤 리셋·스티키 정상
⑤ 색·모션·타이포 grep 위반 0(G-D1~G-D3) ⑥ 죽은 컨트롤·중복 정의 0.
증거는 docs/evidence/g4/에 평탄 경로로 남긴다.
