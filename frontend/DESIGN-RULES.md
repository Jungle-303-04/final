# Opsia UI 디자인 규칙 v1

기준: **Vercel Geist**(의미 토큰·정보 우선·차분한 표면) + **shadcn/Tremor 차트 문법** + **Vercel AI SDK 채팅 패턴**을
**Apple HIG 감각**(컬러는 데이터에만·헤어라인·스프링 모션)으로 디벨롭한 팀 규칙.
토큰 구현: `src/devpreview/theme.ts` — **모든 색·타이포·모션·라운드는 이 파일에서만 가져온다. 컴포넌트 안 하드코딩 금지.**

## 1. 컬러
- 표면 3층: `bg`(페이지) / `card`(표면) / 헤어라인 `line·line2`. 구분은 그림자보다 헤어라인 먼저.
- 잉크 3단: `ink`(본문) / `ink2`(보조) / `ink3`(라벨). 4단계 이상 만들지 않는다.
- `BLUE`는 선택·포커스·링크 전용. 상태는 `HP.ok/warn/crit`만. 상태색을 장식에 쓰지 않는다.
- 틴트는 `TINT.*`의 fg/bg/bd 짝으로만 (Badge·칩·경고 박스 공용). 임의 rgba 조합 금지.

## 2. 타이포 (Geist 스케일 × 애플 가독)
- `TYPE`: caption 11 · label 12 · body 13 · bodyStrong 14 · title3 15.5 · title2 17 · title1 21.
- 웨이트 400/600/700/800. **500 금지**(대비 부족). 숫자는 `MONO` + `tabular-nums`.
- 레터스페이싱: 제목 -0.02em, 라벨(대문자) +0.05~0.07em.

## 3. 모션 (motion/react 스프링 3종 — 임의 duration 금지)
- `SOFT`: 요소 등장, 탭 인디케이터(layoutId), 토스트.
- `SPRING`: 카드·위젯 레이아웃 변화(layout).
- `PAGE`: 뷰 전환(드릴 push/hero).
- 차트 선 드로잉은 `EASE_DRAW` + pathLength. CSS 전환은 폭·색 등 미세 변화만(.28s cubic-bezier(.32,.72,0,1)).
- 리스트 등장 stagger는 delay `i*0.04~0.05`, 8개 이후 캡.

## 4. 표면·엘리베이션
- 기본 카드: `card` + `line` 1px + `RADIUS.card(14)`/panel(16). 그림자 없음.
- hover: `ELEV.hover` + 보더 틴트. 떠 있는 것(팝오버 `ELEV.pop`, 오버레이 `ELEV.overlay`)만 큰 그림자.
- 반투명 유리(blur)는 알림 센터·툴팁 등 **일시적 표면**에만.

## 5. 레이아웃
- 4px 그리드. 페이지 패딩 16~18, 카드 내부 14~24.
- 스크롤 영역은 항상 `scrollbar-gutter: stable` + 바깥 clip(라운드 침범 금지).
- 오버레이는 상단바·사이드바를 덮지 않는다(top=실측 헤더 높이, left=내비 폭). 폭은 드래그 리사이즈 허용.
- 그리드는 `minmax(0,1fr)` + 아이템 `minWidth:0` — 리사이즈에 절대 무너지지 않게.
- **표는 가로 스크롤 금지**: 고정폭 컬럼은 `minmax(48px, w)`로 감싸 축소 허용.

## 6. 차트 (Tremor/shadcn 문법)
- 구성: 점선 그리드(25/50/75) + 좌축 값 라벨 + 하단 시간 라벨 + 그라데이션 면 + 1.8px 선.
- 인터랙션: hover 크로스헤어 + 값 칩, 현재점 펄스. 전환 시 pathLength 드로잉.
- 상태 반영: 임계 리소스는 선·면 톤이 `HP.crit`.

## 7. 카피
- 서비스 톤 자연 한국어, 설명용 안내 문구 금지(빈 상태는 섹션 자체를 숨김).
- 기술 고유명사(Pod, OOMKilled, kubectl)는 원문 유지. 문장부호로 끝내지 않는다.

## 8. 데이터 정합 (최상위 규칙)
- 화면의 모든 숫자는 단일 인벤토리(`podInventory/nodeInventory/repoInventory`)에서 파생.
- 같은 개념은 같은 아이콘·같은 색 (Service=Plug, 상태색=HP). 두 화면이 다른 숫자를 말하면 버그다.
