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
배포 SHA : 10f0fad17bcf2e22880e4adae1194fa103736a69 (FULL, run 29302233623)
상태판 소스: dev의 이 파일이 포함된 커밋
갱신     : 2026-07-14 13:31 KST  P1~P5 완료 · S0 모션 기반 구현 완료
```

- public health: HTTP 200
- console bundle: `assets/index-D3C-AWTZ.js`
- backend digest: `sha256:fcc6f15594683388588f2fa7ded3050ea5594871592aa7797ac0e20664aaec54`
- console digest: `sha256:a177d3aa45518469af852e2f15af4cdb4d6b064775392291afcd7eefe70e8d17`
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
- [ ] **S1**  Clusters 목록           ← 클러스터 카드. 안에 서버가 작은 블록으로 미리 보인다
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

- [x] VP-017 duration·easing·stagger 토큰 중앙화
- [x] FLIP rect 수집·역변환·420ms camera morph 테스트
- [x] 스태거 520ms 상한·서버→파드 wave 테스트
- [x] reduced-motion에서 CSS 모션 1ms·JS morph 완전 생략
- [x] `@keyframes`·Web Animations 소유권을 `src/motion/`으로 제한하는 design guard
- [x] S0 전용 21개 테스트·typecheck·lint·production build 통과
- [ ] S0 SHA 자동 배포 및 public 화면 무회귀 확인

---

## 기획 정본

| 문서 | 내용 |
|---|---|
| `docs/auto/codex-goal-directive-20260714.md` | **세션이 따르는 지시서** |
| `docs/spec/frontend/vp-015-global-shell.md` | 화면 골격 (충돌 시 이게 이긴다) |
| `docs/spec/frontend/vp-017-motion-spec.md` | 모션 규격 (수치가 계약) |
| `docs/spec/frontend/vp-016-delivery-plan.md` | 슬라이스 계획 |
| `docs/auto/open-decisions-20260714.md` | 미확정 6건 (기본값으로 진행) |
