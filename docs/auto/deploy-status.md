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
배포 SHA : ffd92adf28eb9f4c6f1023da4d64fd0f94090980 (FULL, run 29307309415)
상태판 소스: dev의 이 파일이 포함된 커밋
갱신     : 2026-07-14 14:43 KST  S1 public 확인 · S2 배포 중 · S3 local green
```

- public health: HTTP 200
- console bundle: `assets/index-D7YfREbT.js`
- backend digest: `sha256:1d37b4f44a28cd16c713393e5875968991bd6130b3e71ab9fc010be14d706ad9`
- console digest: `sha256:0581c1ae9bcab6d8146973623809cc7b7d029eccb32fa7113479a136c83bb9f4`
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
- [ ] **S2**  클러스터 연결 위자드     ← ＋ 버튼 → 한 줄 명령 복사 → 자동 연결
- [ ] **S3**  태그형 검색 (1층)       ← 타이핑 → 타입별 제안 → 칩
- [ ] **S4**  물리 뷰 그래프 (2층) ★  ← 클러스터 클릭 → 카메라가 서버로 내려간다
- [ ] **S5**  표 + 스파크라인 (3층)
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
- [ ] S2 자동 배포/public 확인 — Dev Deploy `29308195905` 진행 중
- [x] S3 BQ-073 `GET /filter-facets` 구조축/검색축·권한/snapshot/count 완전성 계약
- [x] S3 shell 단일 command popover·타입 칩·canonical URL·abort/stale 응답 차단
- [x] S3 Resources 표를 서버 필터 결과로 전환 — app/label/health/query/multi-namespace 실제 축소
- [x] S3 local 검증 — frontend 155 files / 1015 tests, typecheck·lint PASS; backend targeted 20 tests PASS
- [x] S3 `make gate-fast` — Ruff/import/compile/Dev Gate 계약 + frontend 155 files / 1015 tests
- [ ] S3 dev push·자동 배포/public 확인

---

## 기획 정본

| 문서 | 내용 |
|---|---|
| `docs/auto/codex-goal-directive-20260714.md` | **세션이 따르는 지시서** |
| `docs/spec/frontend/vp-015-global-shell.md` | 화면 골격 (충돌 시 이게 이긴다) |
| `docs/spec/frontend/vp-017-motion-spec.md` | 모션 규격 (수치가 계약) |
| `docs/spec/frontend/vp-016-delivery-plan.md` | 슬라이스 계획 |
| `docs/auto/open-decisions-20260714.md` | 미확정 6건 (기본값으로 진행) |
