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
배포 SHA : 대기 (S0 시작 전)
갱신     : 2026-07-14  기획 확정 · 코덱스 목표모드 전환 [D-048]
```

---

## 선행 조건 (이게 끝나야 S1을 시작한다)

- [ ] P1  기획 문서 dev 착륙 (VP-014~017, radar-parity-map)
- [ ] P2  `AWS_DEV_DEPLOY_ENABLED=1`  ← **0이면 자동 배포가 안 된다. 최우선**
- [ ] P3  백엔드 FULL 배포 (live가 07-13 구버전)
- [ ] P4  에이전트 재등록 (DB 재생성으로 토큰 소실 → 클러스터 데이터 0)
- [ ] P5  Radar 서브트리 + NOTICE (Apache-2.0. 이식 전 필수)

---

## 슬라이스 (VP-016)

- [ ] **S0**  모션 기반 (VP-017)      ← 화면 변화 없음. 토큰·FLIP 훅·테스트
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

(첫 슬라이스 배포 후 여기에 체크리스트가 채워진다)

---

## 기획 정본

| 문서 | 내용 |
|---|---|
| `docs/auto/codex-goal-directive-20260714.md` | **세션이 따르는 지시서** |
| `docs/spec/frontend/vp-015-global-shell.md` | 화면 골격 (충돌 시 이게 이긴다) |
| `docs/spec/frontend/vp-017-motion-spec.md` | 모션 규격 (수치가 계약) |
| `docs/spec/frontend/vp-016-delivery-plan.md` | 슬라이스 계획 |
| `docs/auto/open-decisions-20260714.md` | 미확정 6건 (기본값으로 진행) |

---

# (이전) 07-13 인프라 관측 스냅샷


# AWS dev 배포 상태

팀원이 현재 접속 가능한 환경과 실제 배포 artifact를 확인하는 단일 진입점이다. 배포 파이프라인이
이 파일을 갱신하는 단계는 아직 연결되지 않았으므로 관측 시각을 먼저 확인한다.

## 접속

- URL: <https://k8s.woonyong.org>
- 실측: `GET /api/healthz`가 HTTP 200과
  `{"status":"ok","service":"api-gateway"}`를 반환했다.
- 계정 파일 생성:

```bash
TEAM_SECRET_ID=kubeheal/test/team \
TEAM_AWS_REGION=ap-northeast-2 \
bash scripts/bootstrap-team-env.sh
```

명령은 AWS Secrets Manager `kubeheal/test/team`의 `AUTH_EMAIL`, `AUTH_PASSWORD`,
`BASE_URL`을 읽어 gitignore된 `.env.local-test`를 권한 `0600`으로 만든다. secret 값은 이 문서나
shell 출력에 복사하지 않는다. 해당 secret을 읽을 IAM 권한이 필요하다.

## 배포 artifact

| 항목 | 관측값 |
|---|---|
| ECR tag | `kubernetes-ops-service:c704729c1b` |
| Pod image digest | `sha256:132cbc945004812ae3367c21a3408da8f3c9ab1a01b5870ffdea1157c83f5d0a` |
| tag-derived source SHA | `c704729c1b16a6fd397e1c7285249f80517a01a8` |
| 관측 당시 canonical | `9728d8e6f1eb996a4e522d8f9451a3ff351a3864` |

Deployment와 ECR에 OCI source revision attestation이 없으므로 digest가 실제 실행 artifact의
권위값이다. source SHA는 tag 이름으로부터 파생한 값이며 attestation 증명이 아니다.

## 확인이 더 필요한 항목

- Secrets Manager의 `BASE_URL`은 실측 public URL과 일치하지 않았다. 계정 파일 생성 뒤 URL을
  public URL로 확인해야 한다.
- 실제 로그인 smoke는 수행되지 않았다. 현재 GitHub 배포 변수 `AWS_BOOTSTRAP_ADMIN=0`이므로
  관리자 bootstrap 실행 여부를 DB와 로그인으로 확인해야 한다.
- live DB에는 `alembic_version`이 없고 create-all 기반 부분 스키마가 있어 임의 stamp를 할 수 없다.
- live Deployment의 `DEV_AUTH_BYPASS=0` 명시값은 확인되지 않았다. 새 배포 전 렌더와 live 값을
  모두 차단 게이트로 검증해야 한다.
