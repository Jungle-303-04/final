---
title: AWS dev 배포 상태 — 팀원용 단일 진입점
status: active
updated: 2026-07-14
---

# 지금 배포된 것

> **팀원용.** 이 파일만 보면 "지금 뭐가 되는지"와 "어떻게 확인하는지"를 알 수 있다.
> 세션이 슬라이스를 닫을 때마다 갱신한다. **갱신 안 된 슬라이스는 완료가 아니다.**

```
URL      : https://k8s.woonyong.org
배포 SHA : V1 `61284a2b2` public(console) · 운영체제/다크/라이트 테마
상태판 소스: dev의 이 파일이 포함된 커밋
갱신     : 2026-07-14 22:01 KST  V1 console public · 실제 브라우저 검증 완료
```

- public health: HTTP 200
- console bundle: `assets/index-DFUbqWhB.js`
- backend digest: `sha256:7a96ee6f5d8b1b67815d54d107d20c6f70eec2c51f97156518c1346a010be7db`
- console digest: `sha256:ad8f8e834095b56cd255864c439f53a0d48ba5918ddfd8c6417cc34045da872a`
- 로그인·클러스터·리소스 read smoke: 통과
- Dev Gate: `29333928109` SUCCESS
- CONSOLE 배포: `29334319541` SUCCESS — service/DB 단계 미실행
- 공개 브라우저: source SHA `61284a2b211c177d0958a616d9ad5d8a672fe8f6`,
  운영체제 기본·OS 변경 추종·명시적 다크/라이트 고정, desktop/mobile console error 0

---

## 선행 조건 (이게 끝나야 S1을 시작한다)

- [x] P1  기획 문서 dev 착륙 (VP-014~017, radar-parity-map) — `a4ae8a04b`
- [x] P2  `AWS_DEV_DEPLOY_ENABLED=1` — 자동 FULL run `29305760596` 실행 확인
- [x] P3  백엔드 FULL 배포 — run `29302233623`, 모든 서비스 동일 backend digest
- [x] P4  에이전트 재등록 — cluster-1/2 `ready`, agent 1/1, 클러스터 2개·리소스 read 확인
- [x] P5  `10461f40…` 492파일 완결 스냅샷 + root NOTICE + Apache-2.0 전문 + README 귀속

---

## 슬라이스 (VP-016)

- [x] **S0**  모션 기반 (VP-017)      ← 정확한 토큰·FLIP·스태거·reduced-motion·가드
- [x] **S1**  Clusters 목록           ← 클러스터 카드. 안에 서버가 작은 블록으로 미리 보인다
- [x] **S2**  클러스터 연결 위자드     ← ＋ 버튼 → 한 줄 명령 복사 → 자동 연결
- [x] **S3**  태그형 검색 (1층)       ← 타이핑 → 타입별 제안 → 칩
- [x] **S4**  물리 뷰 그래프 (2층) ★  ← public strict topology 200 실측
- [x] **S5**  표 + 스파크라인 (3층)    ← `7354ee91` 자동 배포·public bundle 확인
- [ ] **S6 (재작업)**  상세 = peek → 전체화면 3상태, 사이드바 독립
- [x] **S7**  AI 패널
- [x] **S8**  하단 독 + 로그 스트림
- [x] **S9**   관계 뷰 토글          ← public strict 관계 graph 200·edge 참조 무결성 확인
- [ ] **S10**  Applications          ← console public, service-admin scope 500 수정 local·재배포 전
- [ ] **S11**  시간 스크럽 (TimelineStrip) ← BQ-057·히스토그램/gap/마커/재생 local 완료, public 전
- [ ] S12  Issues + RCA + 증거
- [ ] S13  변경 적용 진행 ★           ← 고스트 파드. 데모의 클라이맥스
- [ ] S14  GitOps (변경 + 동기화 2탭)
- [ ] S15  Checks (31개 감사)
- [ ] S16  Settings + 정책
- [ ] S17  Home 위젯 조합

**S0~S8이 끝나면 이미 시연 가능한 제품이다.**

---

## 이번 슬라이스에서 확인할 것

- [x] BQ-069 nullable 서버/앱/인시던트/last-seen 계약 — 미확인 값을 0으로 내리지 않음
- [x] `/clusters` 최상단 라우트·provider enum 아이콘·연결 상태 카드
- [x] 서버 예고 블록 20×14px·최대 5개·`data-morph-id="server:<cluster>:<i>"`
- [x] `node-land` 70ms 스태거·reduced-motion 연동
- [x] 카드 클릭 URL이 기존 필터를 보존하며 `clusters=<id>`를 교체
- [x] S1 전용 테스트 + 전체 `make gate-fast` — 149 files / 1007 tests
- [x] S0/S1 SHA 자동 배포 및 public `/clusters` 경로 확인 — run `29307309415`, health/root/route 200
- [x] S2 `service_admin` 전용 ＋ 버튼·4단계 기존 클러스터 연결 위자드
- [x] 서버 발급 한 줄 명령 복사·2초 연결 poll·닫기 시 abort·등록 POST 무재시도
- [x] `POST /clusters/connect`가 기존 안전한 target 등록 경계(UoW·hashed token·TTL)를 재사용
- [x] `GET /clusters/{id}/connection`이 `waiting|connected|expired`만 반환하고 미확인 시각을 합성하지 않음
- [x] S2 전체 gate·dev push — `4a3975b2b`, Dev Gate `29308053053` SUCCESS
- [x] S2 자동 배포/public 확인 — Dev Deploy `29308195905` SUCCESS
- [x] S3 BQ-073 `GET /filter-facets` 구조축/검색축·권한/snapshot/count 완전성 계약
- [x] S3 shell 단일 command popover·타입 칩·canonical URL·abort/stale 응답 차단
- [x] S3 Resources 표를 서버 필터 결과로 전환 — app/label/health/query/multi-namespace 실제 축소
- [x] S3 local 검증 — frontend 155 files / 1015 tests, typecheck·lint PASS; backend targeted 20 tests PASS
- [x] S3 `make gate-fast` — Ruff/import/compile/Dev Gate 계약 + frontend 155 files / 1015 tests
- [x] S3 dev push·Dev Gate — `6464e01a3`, Dev Gate `29309632515` SUCCESS
- [x] S3 backend public — `/api/filter-facets?q=check` HTTP 200
- [x] S3 console/public SHA 기록 완료 — Dev Deploy `29309787652` SUCCESS,
  public bundle `index-B0PpHX5h.js`, health/root/Resources 200
- [x] S4 BQ-074 물리 topology 계약 — 단일 권한 클러스터·snapshot·서버 판정
  `matches_filter`·matched/total 완전성·서버별 문제 우선 12개 제한·미확인 metric null
- [x] S4 물리 그래프 — ELK/@xyflow 서버 카드·고정 파드·사용률 채움·비정상 배지·
  비매칭 opacity 20%·+N 표 이동·cluster↔server FLIP·골격/스태거/reduced-motion
- [x] S4 local 검증 — backend 56 tests, frontend 161 files / 1028 tests,
  typecheck·lint·500-file design guard·production build PASS
- [x] S4 gate-fast·dev push — `78b8ce0e2`, Dev Gate `29311971097` SUCCESS
- [x] S4 자동 배포/public 확인 — S4 포함 `03030867` run `29313095446` SUCCESS 뒤
  발견한 `cluster_id` 누락을 `fba675e2` backend rollout으로 보정; public strict topology 200
- [x] S5 BQ-030 batch metrics history — 최대 100 pod stable ID를 권한·필터·snapshot과
  다시 교차 검증하고 null/빈 points·completeness를 그대로 반환, per-row fan-out 금지
- [x] S5 kind별 smart table — canonical facts만 소비, 정렬·snapshot-safe Load more 연결,
  Recharts CPU 스파크라인은 실측 2점 이상일 때만 표시하고 클릭 시 같은 상세 identity 사용
- [x] S5 local 검증 — backend targeted 31 tests, frontend 167 files / 1049 tests,
  typecheck·lint·516-file design guard·production build PASS
- [x] S5 gate-fast·dev push — `7b18c49b4`, frontend 167 files / 1050 tests,
  Dev Gate `29313454756` SUCCESS
- [x] S5 자동 배포/public 확인 — `7354ee91` run `29313980647` SUCCESS,
  public bundle `index-DDzxYCh0.js`, health/root 200
- [x] S6 BQ-061 exact resource capability — inventory.read 선확인, deploy.run·연결된
  `command_receiver`·target namespace를 모두 만족한 Deployment restart/scale만 반환
- [ ] S6 (재작업) 3상태 상세 — 기존 즉시 전체화면·56px nav rail 규정은 철회됨;
  V2에서 상세의 사이드바 자동 접기를 제거했고 peek → full 동일 컴포넌트 전환은 후속 구현
- [x] S6 capability 소비 — 응답 subject를 상세 identity와 재검증하고 허용된 mutation만
  확인 dialog와 실제 restart/scale API에 연결; 실패·403·불일치에는 버튼 미렌더
- [x] S6 local 검증 — backend capability 67 tests 및 topology 회귀 11 tests,
  `make gate-fast` PASS, frontend 171 files / 1062 tests, design guard 534 files, production build PASS
- [x] S6 dev push·Dev Gate — `fba675e2`, Dev Gate `29315633512` SUCCESS
- [x] S6 자동 배포/public 체크리스트 — run `29315860051` SUCCESS;
  health/root/topology 200, S6 console bundle 확인
- [x] S7 BQ-052/053/066 evidence-bound AI facade — strict context, `inventory.read`
  concrete cluster scope, 내부 링크 allowlist, raw metadata 차단, 근거 없으면 정본 no-data
- [x] S7 오른쪽 AI 패널 — 고정 ✦, 420px/300ms 1단계, 내부 고정폭,
  360~640px resize, 정확한 화면·필터·선택 칩, 좁은 상세 자동 닫힘+toast
- [x] S7 회귀 검증 — 오른쪽 sibling·고정 trigger·단일 transition·근거 없는 답변 차단,
  strict API/Zod/adapter·production build·`make gate-fast` 175 files/1072 tests PASS
- [x] S7 dev push·Dev Gate·자동 배포 — `86e5b2248`, gate `29317039043` SUCCESS,
  deploy `29317259067` SUCCESS, public health/root/topology 200,
  bundle `index-Daugb6IC.js`; trusted-proxy public session과 direct gateway 무인증 401 경계 재확인
- [x] S8 BQ-058/059 SSE — Pod/workload exact target, `inventory.read`+`evidence.read`,
  server-built Loki selector, persisted command, 4096자 redact/truncate, strict default `data:` envelope
- [x] S8 하단 로그 독 — 여러 탭·`l`·높이 조절·접기·상세 동시 표시·수동 재시도,
  8탭/탭당 2,000줄 상한, 종료 subscription 회수와 generation guard
- [x] S8 AI 로그 맥락 — raw line 대신 최초 persisted command ID만 전달하고 같은 correlation의
  후속 완료 배치를 사용자·workspace·논리 target으로 다시 검증해 최신 근거만 소비
- [x] S8 스트림 경계 — EOF terminal 필수, split CRLF, 64KiB frame 상한, reader cleanup,
  REST nginx buffering off를 image/live ConfigMap exact location에 고정
- [x] S8 검증 — backend targeted 71 tests, frontend 전체 181 files/1,095 tests,
  typecheck·lint·567-file design guard·production build·rebase 후 `make gate-fast` PASS
- [x] S8 dev push·Dev Gate — `1d430ba76`, gate `29320899688` SUCCESS;
  public OpenAPI와 실재 Pod SSE에서 `connected→pod_added→log` event를 확인하고 raw line은 출력하지 않음
- [x] S8 자동 배포/public 확인 — deploy `29321131846` SUCCESS, service/console immutable rollout과
  post-deploy smoke 통과, rollback skipped; health/root 200, bundle `index-DjRxj1b1.js`
- [x] S9 BQ-075 관계 topology — 동일 workspace·단일 cluster/application 권한·canonical filter·
  pinned snapshot을 재검증하고 evidence-backed `owns|runs_on|selects|routes_to`만 exact shape로 반환
- [x] S9 필터 파생 뷰 — Application/복수 non-Pod는 relations, app+Pod-only와 물리 scope는 physical;
  자동 전환은 URL을 쓰지 않고 수동 선택은 `view=physical|relations`로 핀, 전체 필터 삭제 시 핀 해제
- [x] S9 연속 장면 — target ready/failed 전까지 같은 cluster의 직전 scene을 유지하고
  동일 Pod `data-morph-id`를 local capture/play로 FLIP; filter-derived pending 전환의 실제 `animate` 호출 회귀 고정
- [x] S9 관계 그래프 — ReactFlow+ELK, 서버 응답 kind 칩, endpoint 양쪽 kind AND edge 투영,
  6초 힌트·즉시 되돌리기·수동 pin 시 힌트 종료, mobile 2행 header 공간 확보
- [x] S9 검증 — backend Ruff + topology/resource graph 회귀 56 tests,
  frontend 185 files/1,107 tests·typecheck·lint·589-file design guard·production build PASS
- [x] S9 자동 배포/public 확인 — gate `29323618648`, deploy `29323876248` SUCCESS;
  health/root/relations topology 200, bundle `index-D7LbqrTl.js`, strict key·edge endpoint 참조 무결성 PASS
- [x] S10 BQ-039~042 — Applications 목록·상세·배포 이력·Git↔cluster semantic drift를
  workspace/application/cluster 권한과 temporal inventory·exact incident evidence에 묶고 raw payload 차단
- [x] S10 Applications UI — 문제 우선 카드·동일 결과 표 전환, canonical 공통/app 필터,
  URL-backed 상세·개요/리소스/배포 이력/차이/인시던트 5탭, 소유 화면 drilldown만 제공
- [x] S10 정직성 — 미확인 health/count/incident/drift를 null·unknown·unavailable로 유지,
  민감/복합 diff 양쪽 redaction, resource 목록·incident 상세·GitOps diff 중복 렌더 금지
- [x] S10 local 검증 — backend 관련 45 tests, frontend 전체 188 files/1,121 tests,
  typecheck·lint·610-file design guard·production build PASS
- [x] S10 브라우저 시각 검증 — 실제 AWS shell + representative strict response로 desktop 1440px,
  mobile 390px 목록·상세·5탭 확인; horizontal overflow 0, console error 0
- [x] S10 dev push·Dev Gate — `051fcd3b0`, gate `29326238164` SUCCESS;
  자동 Dev Deploy `29326466743` SUCCESS, public bundle `index-MbLKlq1P.js`
- [x] S10 public 500 원인/근본 수정 — trusted-proxy service-admin의 application wildcard `None`을
  `set(None)` 처리하던 신규 product scope를 정본 `resolve_allowed_application_ids`로 교체;
  concrete workspace application ID 물질화 회귀 포함 Applications 관련 47 tests PASS, 재배포 전
- [x] S11 BQ-057 — `[from,to)`·24h/1,440 bucket·1,000 event 상한, strict stable 정렬,
  immutable inventory/RCA/workflow evidence만 합치고 관측 부재 bucket은 병합 gap으로 명시
- [x] S11 TimelineStrip — `t.range`/`t.at`, 15m/1h/6h/24h, histogram·warning,
  native range·incident button·gap 상태·과거 badge·12초 bounded replay, 보간/가짜 snapshot 없음
- [x] S11 local 검증 — backend 관련 76 tests·전체 2,250 passed/3 skipped,
  frontend 전체 193 files/1,132 tests·typecheck·lint·623-file design guard·production build PASS
- [x] S11 브라우저 시각 검증 — strict representative response로 desktop 1440px·mobile 390px,
  historical URL·marker·overlay 확인, document horizontal overflow 0

---

## 기획 정본

| 문서 | 내용 |
|---|---|
| `docs/auto/codex-goal-directive-20260714.md` | **세션이 따르는 지시서** |
| `docs/spec/frontend/vp-015-global-shell.md` | 화면 골격 (충돌 시 이게 이긴다) |
| `docs/spec/frontend/vp-017-motion-spec.md` | 모션 규격 (수치가 계약) |
| `docs/spec/frontend/vp-016-delivery-plan.md` | 슬라이스 계획 |
| `docs/auto/open-decisions-20260714.md` | 미확정 6건 (기본값으로 진행) |
