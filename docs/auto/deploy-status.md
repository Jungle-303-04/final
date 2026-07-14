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
배포 SHA : console S5 포함 `7354ee91` public · S6 `fba675e2` rollout 진행 중
상태판 소스: dev의 이 파일이 포함된 커밋
갱신     : 2026-07-14 17:01 KST  topology 200 복구 · S5 public · S6 rollout · S7 local green
```

- public health: HTTP 200
- console bundle: `assets/index-DDzxYCh0.js`
- backend digest: `sha256:7a96ee6f5d8b1b67815d54d107d20c6f70eec2c51f97156518c1346a010be7db`
- console digest: `sha256:6b21c379ac18325d29d5d7a0786a1789d52f6fc4649d28cdd52c13555f2276cc`
- 로그인·클러스터·리소스 read smoke: 통과

---

## 선행 조건 (이게 끝나야 S1을 시작한다)

- [x] P1  기획 문서 dev 착륙 (VP-014~017, radar-parity-map) — `a4ae8a04b`
- [x] P2  `AWS_DEV_DEPLOY_ENABLED=1` — 자동 FULL run `29305760596` 실행 확인
- [x] P3  백엔드 FULL 배포 — run `29302233623`, 모든 서비스 동일 backend digest
- [x] P4  에이전트 재등록 — cluster-1/2 `ready`, agent 1/1, 클러스터 2개·리소스 read 확인
- [x] P5  Radar v1.5.7 고정 소스 `88bd1e97…` + root NOTICE + README 귀속

---

## 슬라이스 (VP-016)

- [x] **S0**  모션 기반 (VP-017)      ← 정확한 토큰·FLIP·스태거·reduced-motion·가드
- [x] **S1**  Clusters 목록           ← 클러스터 카드. 안에 서버가 작은 블록으로 미리 보인다
- [x] **S2**  클러스터 연결 위자드     ← ＋ 버튼 → 한 줄 명령 복사 → 자동 연결
- [x] **S3**  태그형 검색 (1층)       ← 타이핑 → 타입별 제안 → 칩
- [x] **S4**  물리 뷰 그래프 (2층) ★  ← public strict topology 200 실측
- [x] **S5**  표 + 스파크라인 (3층)    ← `7354ee91` 자동 배포·public bundle 확인
- [ ] **S6**  상세 = 전체화면 덮기
- [ ] **S7**  AI 패널
- [ ] **S8**  하단 독 + 로그 스트림
- [ ] S9   관계 뷰 토글
- [ ] S10  Applications
- [ ] S11  시간 스크럽 (TimelineStrip)
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
- [x] S6 전체화면 상세 — `?detail=kind/ns/name`, 뒤로가기·Esc·행 포커스 복귀,
  J/K 연속 탐색, 56px nav rail, 읽기 전용 필터 맥락, 5개 탭, 320ms 동시 모션
- [x] S6 capability 소비 — 응답 subject를 상세 identity와 재검증하고 허용된 mutation만
  확인 dialog와 실제 restart/scale API에 연결; 실패·403·불일치에는 버튼 미렌더
- [x] S6 local 검증 — backend capability 67 tests 및 topology 회귀 11 tests,
  `make gate-fast` PASS, frontend 171 files / 1062 tests, design guard 534 files, production build PASS
- [x] S6 dev push·Dev Gate — `fba675e2`, Dev Gate `29315633512` SUCCESS
- [ ] S6 자동 배포/public 체크리스트 — run `29315860051` service rollout 진행 중;
  중간 실측 health/root/topology 200, console은 선행 S5 bundle
- [x] S7 BQ-052/053/066 evidence-bound AI facade — strict context, `inventory.read`
  concrete cluster scope, 내부 링크 allowlist, raw metadata 차단, 근거 없으면 정본 no-data
- [x] S7 오른쪽 AI 패널 — 고정 ✦, 420px/300ms 1단계, 내부 고정폭,
  360~640px resize, 정확한 화면·필터·선택 칩, 좁은 상세 자동 닫힘+toast
- [x] S7 회귀 검증 — 오른쪽 sibling·고정 trigger·단일 transition·근거 없는 답변 차단,
  strict API/Zod/adapter·production build·`make gate-fast` 175 files/1072 tests PASS; dev push 대기

---

## 기획 정본

| 문서 | 내용 |
|---|---|
| `docs/auto/codex-goal-directive-20260714.md` | **세션이 따르는 지시서** |
| `docs/spec/frontend/vp-015-global-shell.md` | 화면 골격 (충돌 시 이게 이긴다) |
| `docs/spec/frontend/vp-017-motion-spec.md` | 모션 규격 (수치가 계약) |
| `docs/spec/frontend/vp-016-delivery-plan.md` | 슬라이스 계획 |
| `docs/auto/open-decisions-20260714.md` | 미확정 6건 (기본값으로 진행) |
