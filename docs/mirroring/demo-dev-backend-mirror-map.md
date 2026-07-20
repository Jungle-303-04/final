---
title: Opsia 미러링 맵 — 데모 ↔ dev ↔ 백엔드 계약
status: draft-v1
date: 2026-07-20
author: choi woo-nyong
scope: 전체 서피스 (홈·리소스·배포·인시던트·타임라인·점검·비용·알림·AI 대화·설정)
direction: 데모(디자인 정본) → dev(라이브 구현), 백엔드 계약 기준 정합
---

# Opsia 미러링 맵 — 데모 ↔ dev ↔ 백엔드 계약

## 0. 목적 · 방법 · 소스

**목적.** 데모 UI(더미 데이터·데모 문법 디자인)를 dev UI(라이브 백엔드)로 1:1 미러링하되, 병합 시 더미와 실제 백엔드 계약의 불일치로 생기는 오류를 사전 차단한다. 동시에, 백엔드가 이미 제공하지만 어느 UI에도 노출되지 않은 기능을 찾아 자연스러운 연결 지점을 제안한다.

**세 소스.**
- **백엔드 기능(권위 기준):** 사용자가 제공한 25개 카테고리 전수 목록. "무엇이 가능한가"의 정본.
- **dev UI(라이브 바인딩):** `SW_AI_W17-21-final-dev` / `dev`. 실제 API·zod 스키마(`frontend/src/api/*-schemas.ts`)에 바인딩. "무엇이 실제로 붙어 있나".
- **데모 UI(디자인 정본):** `SW_AI_W17-21-final-front` / `front`. `frontend/src/devpreview-*.tsx`(6,095줄). 더미 데이터·데모 문법. "무엇을 어떻게 보여야 하나".

**기존 정합 인프라(재사용).** dev 레포에는 이미 UI↔계약 원장이 있다: `docs/spec/frontend/reference-feature-inventory.md`(240 기능 §4 화면표 / §7 API표), `src/packages/contracts/reference_feature_catalog.json`(각 기능의 `backendContract`/`frontendContract`/`endpoints`/`deliveryStatus`), 서피스별 parity 테스트(`scripts/reference-*-parity.test.mjs`). **주의:** 카탈로그 `endpoints[]`는 레거시 upstream 경로명(`/api` 접두 없음)이라 실제 프론트 경로와 문자열이 다르다 — 바인딩 판정은 `coverage.*.destination`(라우터 fn/컴포넌트)로 한다. 4절 파이프라인은 이 인프라를 확장한다.

**판정 표기.** ✅ 완전 반영 · 🟡 부분/디자인만 · ⛔ 미반영(갭) · ⚙️ 무 UI(인프라/운영) · 🔷 계약 확인 필요

---

## 1. 서피스 정합 요약 (10 메뉴)

통합 관계(사용자 확인): 클러스터 관리→홈, 트래픽→리소스, 애플리케이션·GitOps·Helm→배포.

| # | 메뉴 | 데모 | dev | 백엔드 계약(주 엔드포인트) | 정합 상태 |
|---|------|------|-----|----------------------------|-----------|
| 1 | 홈 | ✅ Fleet 보드·위젯·클러스터 카드 | ✅ `pages/home` + SSE | `/api/clusters`, `/clusters/{id}/summary`, `/home/insights`, `/fleet/summary` | 표면 일치, 위젯 데이터 바인딩 대조 필요 |
| 2 | 리소스 | ✅ 목록·물리·관계·상세 탭 | ✅ `pages/resources` | `/api/topology`, `/inventory/*`, `/capabilities`, `/metrics/*`, `/changes` | 강 일치 |
| 3 | 배포 | ✅ 앱·GitOps·Helm 탭 | ✅ `pages/deploy`(+gitops/helm) | `/applications`, `/gitops/*`, `/helm/*`, `/release-plans` | 강 일치 |
| 4 | 인시던트 | ✅ 큐·RCA·복구 | ✅ `pages/issues` | `/dashboard/rca/issues`, `/rca/bundles/*`, `/rca/recovery-plans/*`, `/audit/timeline` | **계약은 있으나 카탈로그 미등재** |
| 5 | 타임라인 | 🟡 데모 축약 | ✅ `pages/timeline` | `/timeline/{capabilities,overview,snapshots,stream,pins}` | dev가 더 풍부 |
| 6 | 점검 | ✅ | ✅ `pages/checks` | `/checks/overview`, `/checks/{id}`, `/settings/audit` | 깔끔한 1:1 |
| 7 | 비용 | ✅ | ✅ `pages/cost` | `/cost/overview`, `/cost/nodes`, `/rightsizing/workloads` | 일치(단 `/cost/nodes` 다중클러스터 500 이슈 별건) |
| 8 | 알림 | 🟡 데모 부분 | ✅ `pages/alerts` | `/alert-rules`, `/alert-channels`, `/alert-events` | **레퍼런스 카탈로그 미등재 신규면** |
| 9 | AI 대화 | ✅ `devpreview-ai` | ✅ `pages/ai` | `/ai/chat`, `/ai/suggestions`, `/ai/conversations/*` | **레퍼런스 카탈로그 미등재 신규면** |
| 10 | 설정 | 🟡 데모 부분 | ✅ `pages/settings` | `/settings/access`, `/integrations/prometheus` | 관리(조직·멤버 등)는 플레이스홀더 |

핵심 관찰:
- **인시던트·알림·AI**는 백엔드 계약이 실재하고 dev도 붙어 있으나 **240-기능 레퍼런스 카탈로그에는 없다** → 파이프라인이 이 신규면을 원장에 편입해야 미러링·게이트가 성립한다.
- 데모가 부분(🟡)인 면(타임라인·알림·설정)은 **데모→dev 방향이 아니라 dev→데모 보강**이 필요한 소수 예외 → 4.2 규칙으로 처리.

---

## 2. 백엔드 25카테고리 × dev/데모 갭 분석 + 자연스러운 연결 제안

각 카테고리에 대해 **dev 반영 · 데모 반영 · 갭 · 자연스러운 연결 제안**을 정리한다. 제안은 "새 메뉴를 만들지 않고 기존 10개 서피스·상세·도크에 흡수"를 원칙으로 한다.

### C1. 실제 사용자 화면(10 메뉴 통합 구조) — ✅
dev·데모 모두 10메뉴 + 통합 구조 일치. 갭 없음. (미러링의 골격.)

### C2. 인증·워크스페이스·권한 — ⛔ 최대 갭
- **dev:** 세션 조회(`/api/auth/session`)·RBAC 근거(`/settings/access`)·CapabilitySet·권한 거부 표시 ✅. 그러나 **회원가입·로그인·로그아웃·이메일 인증/재전송·이메일 중복확인·관리자 사용자 승인·워크스페이스 전환·조직/그룹 CRUD·그룹 구성원·사용자 목록 관리 UI는 제품 프론트에 없음** ⛔.
- **데모:** 동일하게 없음(데모는 인증 우회).
- **자연스러운 연결 제안:**
  1. **인증 플로우**(회원가입/로그인/이메일 인증/승인 대기)는 제품 셸 밖 **별도 `/auth` 라우트 그룹**으로 신설(로그인 게이트). 데모에는 `devpreview-auth` 서피스로 디자인 정본 추가.
  2. **워크스페이스 전환**은 전역 셸 좌상단 워크스페이스 셀렉터에 **드롭다운**으로 흡수(현재 `default` 고정 표시 지점).
  3. **조직·그룹·사용자·승인 관리**는 **설정 → 관리(Administration) 탭**의 현재 "플레이스홀더 카드"를 실제 화면으로 승격: 사용자 목록/역할, 그룹 CRUD, 승인 대기열.
  4. 계약: 백엔드에 auth/org/group/user 엔드포인트가 이미 있으므로(목록에 명시) UI만 추가 → 4절 파이프라인의 "계약 있음·UI 없음 → UI 추가" 경로.

### C3. 전역 UI 셸 — 🟡
- **dev:** 멀티클러스터·네임스페이스·필터·URL 보존·전역검색·명령팔레트·단축키·알림센터·AI 패널·하단 도크·테마·ko/en·로딩/빈/부분실패/429 상태 대부분 ✅.
- **데모:** 셸·검색·탭·필터 디자인 ✅(더미).
- **갭:** 워크스페이스 셀렉터(C2), 도크/AI 패널 크기조절·Reduced Motion·오프라인/429 구분의 dev 실구현 여부 서피스별 확인 필요 🔷.
- **제안:** C2 셀렉터 흡수 외에는 대부분 존재 → 파이프라인의 상태(로딩/빈/429/오프라인) 렌더 대조 항목으로 편입.

### C4. 홈·Fleet 대시보드 — ✅ (위젯 데이터 대조)
- dev·데모 모두 집계·클러스터 카드·기간·위젯 배치/순서·드릴다운·부분수집 표시 ✅.
- **제안:** 데모 위젯이 보여주는 필드(예: OutOfSync, 활동추세, 네임스페이스 Pod, 비용, 최근변경)를 dev 위젯의 실제 엔드포인트 필드와 1:1 대조(4.1). 홈은 `/fleet/summary`가 실구현이나 카탈로그 미등재 → 원장 편입.

### C5. 클러스터 연결·관리 — 🟡
- **dev:** 홈의 연결 다이얼로그(이름·환경·Agent Manifest·원라인 명령·연결 대기) ✅. **Provider 카탈로그(EKS/GKE/AKS/로컬)·Provider 설정 검증·Provider 클러스터 탐색·연결 사전점검·Scheduling Profile 관리**의 UI 노출은 부분/불명 🔷.
- **데모:** `devpreview-connect`(718줄)에 연결 플로우 디자인 정본 ✅.
- **제안:** 데모 connect 플로우를 정본으로 dev 연결 다이얼로그를 **Provider 선택→검증→탐색→사전점검→등록→대기** 다단계로 미러링. Scheduling Profile은 **클러스터 카드 상세(홈)**의 관리 섹션으로 흡수.

### C6. Kubernetes 리소스 탐색 — ✅
- dev·데모 모두 통합조회·API Discovery·CRD·종류별 개수·필터·Facet·페이지네이션·검색·삭제포함·완전성/신선도·진단·자동갱신·수동새로고침·변경시점 ✅. 지원 종류 목록도 데모 카탈로그(APIService/CNINode/Argo 포함)와 일치.
- **제안:** 데모 카탈로그 count(더미)를 dev의 `/inventory/summary.counts[]` 실값에 바인딩 대조만.

### C7. 리소스 시각화 — ✅
- 목록·물리·관계·트래픽 보기, 색상·실시간 상태변화·확대축소·근거·타임스크러버·전체화면/우측 상세·상세 URL 모두 dev·데모 존재 ✅. (앞서 인프라 뷰 진입 UX도 수정 완료.)

### C8. 리소스 상세 — ✅ (필드 대조)
- 배지·복사·상태/Replica·전략·Pod Template·컨테이너·Image/Port/Req/Limit·Service/Ingress/CronJob/Job/HPA/PVC/Node/Event·RBAC·Secret 키만 노출·Owner/Child·메트릭·신선도 — dev·데모 모두 광범위 ✅.
- **제안:** 상세 탭(개요/YAML/이벤트/로그/권한)별 표시 필드를 `/inventory/resource-detail` 계약과 필드 단위 대조(4.1). 종류별 특화 필드가 미러링 오류 최다 발생 지점.

### C9. 리소스 실행 기능 — ✅/🟡
- **dev:** Scale·Restart·Rollback·CronJob 실행/Suspend·Node Cordon/Drain·Pod/Node Debug·로그 스트림·Pod Terminal·파일 탐색/다운로드·Service 내부요청·Port-forward·실행 전 영향/Diff·RBAC 검증·취소/재시도·CommandReceipt·실행 후 재관측 ✅.
- **데모:** 실행 버튼·확인·진행 표시 디자인 ✅(더미).
- **제안:** 데모의 "복구/실행" 액션 문법(진행 스텝·승인)을 정본으로 dev 액션의 실제 `commands`/`operation-events` 스트림에 미러링. **파괴적 액션은 확인·Cascade Preview 계약 필드 필수 대조.**

### C10. YAML·Manifest — ✅
- 조회·편집·검증·Dry-run·Diff·생성·Git 바인딩 자동판별·Safe PR·Agent Apply·Secret 마스킹·충돌 처리·삭제 Cascade — dev 광범위 ✅, 데모 디자인 ✅.

### C11. 비교 — ✅
- dev `pages/compare/CompareRoute.tsx` 존재(후보 검색·동일/타 클러스터·Typed Diff·민감 비노출·URL 보존) ✅. 데모 노출은 확인 필요 🔷 → 없으면 데모에 비교 서피스 디자인 추가.

### C12. 배포·애플리케이션 — ✅
- 목록·검색·생성/연결·저장소·상세·배포목록/이력·Drift·Topology·워크플로·서비스 카탈로그 — dev(`features/applications`) ✅, 데모 배포 탭 ✅.

### C13. Git 저장소·GitOps — ✅
- Provider 인식·연결상태·Probe·Branch/Manifest 탐색·검증·Webhook/Polling·Render·3-way Diff·위험도·Safe PR·승인/거절·Argo/Flux·트리·Sync/Health·Reconcile·Suspend/Resume·Auto-revert·승격 — dev(`features/gitops`) 광범위 ✅.
- **제안:** GitHub Branch/Commit/PR 생성, HMAC 검증은 백엔드 동작 — UI는 "Safe PR 준비→생성" 버튼으로 이미 흡수. 대조만.

### C14. Release Flow — 🟡
- **dev:** Plan CRUD·미리보기·Readiness·Render·Safe PR·Dispatch·Run 시작/단계/Pause/Resume/Retry/Cancel/Rollback·알림 ✅(`release-flow`).
- **갭:** **Plan Archive/Restore·Run Summary·Handoff·실행 보고서·보고서 Export·Release Audit 조회/Export**의 UI 노출 확인 필요 🔷.
- **제안:** 보고서/Export·Archive를 **배포 → 워크플로 상세**의 "실행 보고서" 패널로 흡수(다운로드 버튼).

### C15. Helm — ✅
- 목록·상세·업그레이드 버전·이력·Manifest/Values·각종 Diff(Hook/Rendered 포함)·Values 미리보기·Install/Upgrade/Rollback/Uninstall·실시간 스트림·Chart Catalog·ArtifactHub·Source CRUD·Refresh·인증 비노출 — dev(`pages/helm`) 광범위 ✅.

### C16. 인시던트·RCA·복구 — 🟡 (핵심 데모 자산 + 갭)
- **dev:** 목록·필터·Facet·상세·증거묶음·Supporting/Contradicting/Missing·최근 GitOps 변경·감사 타임라인·원인 후보·규칙 평가·AI Fallback·완료 보고서·원인/영향·복구 계획/후보 선택·Capability/위험도·명령 또는 Safe PR Dispatch·Rollout 진단·복구 진행·Replay — ✅.
- **갭:** **RCA Rule Catalog·RCA Rule 검증·RCA 테스트 시나리오·테스트 실행/취소·Evidence Window 조회·RCA Report 목록**의 전용 UI **없음** ⛔.
- **자연스러운 연결 제안:**
  1. **RCA Rule Catalog·검증·테스트 시나리오**를 **설정 → RCA 규칙** 탭(신설) 또는 **인시던트 상단 "규칙" 서브탭**으로 흡수. 룰 목록·검증 결과·시나리오 실행/취소.
  2. **RCA Report 목록·Evidence Window**는 **인시던트 상세의 "보고서" 탭**으로.
  3. Alertmanager Webhook 인시던트 생성은 백엔드 동작 — 알림→인시던트 승격 UI(C22)와 연결.

### C17. AI 보조 — ✅
- 맥락 전달·(폴링형)대화·단계 표시·근거 응답·리소스 조회 도구·RCA 조사·조치 제안·Alert Rule 생성 제안·확인·대화 CRUD/이력·추천 질문·Provider 추상화·Fallback — dev(`pages/ai`,`features/ai-assistant`) ✅, 데모 `devpreview-ai` ✅.

### C18. 타임라인·진단 — 🟡
- **dev:** 변경 Timeline·Snapshot·NDJSON·Stream·Pin·Gap·Capability·감사 상관 ✅. **진단 세션(Diagnose)**: `features/diagnose/DiagnoseSurface.tsx` 존재하나 **리소스 상세 액션**에만 연결 — 인시던트/타임라인과의 통합 노출은 부분 🟡.
- **제안:** 진단 세션(생성·동의 기록·조사 Turn·중지·Replay·이력)을 **인시던트 상세**와 **타임라인 이벤트 상세**에서 진입하도록 연결. 데모 타임라인을 dev 수준으로 보강(dev→데모 예외).

### C19. Checks·보안 점검 — ✅
- 카탈로그·결과·Warning/Danger·영향 리소스·Remediation·Coverage·권한 미확인 표시·숨김 설정·사용자별 저장·리소스 상세 내 Check·Security/RBAC 리포트 — dev(`pages/checks`) 1:1 ✅.

### C20. 비용·Right-sizing — ✅
- 시간당/월/저장소/유휴/효율·추이·범위·Node Capacity/Usage·Provider/Instance/Zone·Workload 비용·사용률·Scan·절감 후보·가격 미확보 표시 — dev(`pages/cost`+workload-detail) ✅. (`/cost/nodes` 다중클러스터 500은 별건 백엔드 락 이슈, 배포 진행 중.)

### C21. 트래픽·네트워크 — ✅
- 서비스 흐름·프로토콜 분류·Forwarded/Dropped/Error·연결/전송량·외부구분·요청률/오류율·필터·Source 자동탐지·CNI/Dataplane·Source 연결·NetworkPolicy 영향·무데이터 사유 — dev(`pages/traffic`,`ResourcesTrafficFlowSurface/SourcesSection`) ✅. 리소스 내 통합.

### C22. 알림 — 🟡
- **dev:** CPU/메모리/재시작/NotReady 규칙·연산자/Threshold/지속·심각도·범위·규칙 CRUD·채널 CRUD·Webhook·최소심각도·전송 테스트·Event 실시간·Firing/Resolved/Ack·확인·인시던트 승격 ✅(`pages/alerts`).
- **갭:** **Dead Letter 발생 알림** UI 노출 확인 필요 🔷. 데모 알림면 부분 🟡.
- **제안:** Dead Letter는 **알림 → 채널 탭**의 상태 배지 또는 **알림 센터**에 흡수. 데모 알림면을 dev 3탭(이벤트/규칙/채널) 구조로 미러링.

### C23. 실시간 데이터·Agent — ⚙️ (대부분 무 UI)
- Agent Long Poll·Lease/Heartbeat/Result·증거 작업·Snapshot Upsert·Discovery·RBAC 관측·Prometheus/Loki/Tempo·Node Collector·Drift·Reconcile·WS Fan-out·SSE·재연결/백오프·신선도/부분성 근거. 대부분 백엔드/스트림 인프라 → **UI는 신선도/부분성/재연결 배지로만 노출**(이미 dev 존재). 갭 없음(운영 계층).

### C24. 플랫폼 신뢰성·운영 — ⚙️ / 🟡
- NATS·Outbox·Consumer Ledger·Idempotency·Retry/NAK·DLQ·**DLQ Replay**·Audit Projection·Read Model·Change Correlation·Retention·PG/PgBouncer·LISTEN/NOTIFY·Health·자체지표·Command 정리·Secret Vault·mTLS·Redaction.
- 대부분 무 UI(운영). 단 **DLQ 격리/Replay, Retention 정책, Command 만료 정리**는 **관리자 운영 화면**이 있으면 가치.
- **제안:** (선택) **설정 → 관리 → 운영(Operations)** 탭에 DLQ 모니터/Replay·Retention 설정을 흡수. 데모에는 미포함(운영자 전용).

### C25. 데스크톱(Tauri) — ⚙️ 별개
- Tauri 실행·OS 타깃·창 제목·네이티브 메뉴·테마·외부 URL·파일 저장/열기·로컬 PTY·CSP. 미구현: 서명 자동업데이트, Native Port-forward Bridge. **웹 미러링 범위 밖** — 별도 트랙.

---

### 2.x 갭 요약 (우선순위)

| 우선 | 갭 | 백엔드 | dev UI | 연결 지점(제안) |
|------|----|--------|--------|-----------------|
| P1 | 인증·조직·그룹·사용자·승인(C2) | 있음 | ⛔ | `/auth` 신설 + 설정→관리 탭 승격 + 셸 워크스페이스 셀렉터 |
| P1 | RCA 룰 카탈로그·검증·테스트·Report 목록(C16) | 있음 | ⛔ | 설정→RCA 규칙 / 인시던트 규칙·보고서 탭 |
| P2 | 진단 세션 통합 노출(C18) | 있음 | 🟡 | 인시던트·타임라인 상세에서 진입 |
| P2 | Provider 카탈로그·검증·탐색·사전점검·Scheduling(C5) | 있음 | 🟡 | 홈 연결 다이얼로그 다단계화(데모 정본) |
| P2 | Release 보고서/Export·Archive(C14) | 있음 | 🟡 | 배포→워크플로 상세 보고서 패널 |
| P3 | Dead Letter 알림(C22) | 있음 | 🔷 | 알림 채널 탭/알림센터 배지 |
| P3 | DLQ Replay·Retention 운영(C24) | 있음 | ⚙️ | (선택) 설정→관리→운영 탭 |
| — | 신규면 카탈로그 편입(인시던트/알림/AI/홈 fleet) | 있음 | ✅ | 레퍼런스 원장에 등재(4절) |

---

## 3. 더미 → 실데이터 계약 정합 규칙 (미러링 오류 방지의 핵심)

데모는 더미 shape, dev는 실제 계약 shape. 병합 시 필드 불일치가 최다 오류원. 서피스별로 다음 4분류로 판정하고 조치한다.

| 분류 | 조건 | 조치 |
|------|------|------|
| **A. 일치** | 데모 표시 요소 ↔ dev 바인딩 필드 ↔ 백엔드 계약 필드 모두 존재 | 데모 디자인을 dev에 이식, 실제 계약 필드에 바인딩. 끝. |
| **B. UI 있음·계약 없음** | 데모/dev가 보여주려는 값이 백엔드 계약에 없음 | **백엔드 계약 추가 제안**(필드/엔드포인트). 승인 전에는 "미관측(unavailable)" 상태로 표시하고 가짜 값 금지. 계약 추가 후 양쪽 병합. |
| **C. 계약 있음·UI 없음** | 백엔드 계약에 필드/엔드포인트가 있는데 어느 UI도 안 씀 | **UI 추가**(2절 연결 지점). 데모·dev 양쪽에 반영. |
| **D. 데모 전용 시각** | 순수 장식·데모 내러티브(실데이터 근거 없음) | dev로 이식하지 않거나, 실 계약이 생기기 전까지 데모 한정으로 격리 표기. |

**절대 규칙(데모 유산 방지):** dev에는 fixture·가짜 숫자를 넣지 않는다. 계약이 없으면 값 대신 "미관측/권한부족/부분수집" 상태를 렌더한다(이미 dev 전역 상태 문법 존재). 계약이 필요하면 백엔드에 추가하고 라이브에서 재검증한다.

---

## 4. 오류 방지 파이프라인 (reference-parity 확장)

목표: 미러링 작업에서 "데모 요소 ↔ dev 바인딩 ↔ 백엔드 계약" 3자 정합을 **기계적으로** 강제해, 병합 오류를 커밋/게이트 단계에서 잡는다.

### 4.1 미러 원장(Mirror Ledger)
기존 `reference_feature_catalog.json` 옆에 **서피스별 미러 원장** `docs/mirroring/mirror-ledger.json`을 둔다. 각 항목:

```
{
  "surface": "issues",
  "element": "recovery.candidate.blast_radius",
  "demoRef": "devpreview-surfaces.tsx#RecoveryFlow",
  "devRef": "features/issues/IssuesPanels.tsx",
  "backendContract": "recovery-schemas.ts#candidate.blast_radius",
  "backendEndpoint": "/api/rca/recovery-plans/by-correlation/{id}",
  "status": "A|B|C|D",
  "action": "bind | add-contract | add-ui | demo-only",
  "verified": true
}
```

### 4.2 정합 체크(게이트)
신규 스크립트 `scripts/mirror-parity-check.mjs`(기존 `reference-*-parity.test.mjs` 패턴 재사용):
1. **계약 존재 검증:** 원장의 모든 `backendContract`(zod 필드)가 `frontend/src/api/*-schemas.ts`에 실재하는지 파싱 대조. 없으면 실패(→ 계약 추가 필요, 분류 B).
2. **바인딩 검증:** `status:"A"` 항목은 `devRef`가 해당 스키마를 import·사용하는지 정적 확인. 미사용이면 실패.
3. **미노출 계약 리포트:** `*-schemas.ts`의 top-level 응답 필드 중 어느 원장 항목도 참조하지 않는 것을 "계약 있음·UI 없음(C)" 후보로 출력(경고) → 2절 연결 제안 자동 갱신.
4. **가짜값 금지:** dev 코드에서 하드코딩 숫자/문자 리터럴이 계약 필드 자리에 들어간 패턴을 린트(데모 유산 차단).
5. **신규면 편입:** 인시던트·알림·AI·fleet 등 레퍼런스 카탈로그 미등재 서피스를 미러 원장에 필수 등재(누락 시 실패).

### 4.3 CI 편입
- `make mirror-parity-check`를 추가하고 **Dev Gate(`dev-gate.yml`)의 frontend gate**에 편입.
- 데모(front) 레포에도 동일 체크의 "데모측"을 두어(데모 요소↔원장) 양방향 유지. 두 레포가 같은 `mirror-ledger.json` 스키마를 공유(정본은 dev, 데모는 참조).
- 실패 시 메시지: 어떤 서피스·요소가 어느 분류(B/C)로 갭인지 + 제안 조치를 그대로 출력 → 작업자가 계약추가/UI추가를 바로 실행.

### 4.4 작업 루프(미러링 1건 표준 절차)
1. 데모 서피스에서 이식할 요소 선택 → 미러 원장에 초안 등록.
2. `mirror-parity-check` 실행 → 분류(A/B/C/D) 자동 판정.
3. **B**면 백엔드 계약 PR(필드/엔드포인트) → 승인·배포 → zod 스키마 갱신.
4. **A/C**면 dev에 디자인 이식 + 실계약 바인딩(양쪽 레포 병합).
5. 라이브(5175)에서 실데이터로 검증 → 원장 `verified:true`.
6. 게이트 통과 → 커밋(커밋 컨벤션) → 푸시.

---

## 5. 실행 순서 제안

1. **(문서 승인)** 본 맵·파이프라인 승인.
2. **파이프라인 부트스트랩:** `mirror-ledger.json` 스키마 + `mirror-parity-check.mjs` 최소 버전 + `make` 타깃. 먼저 **인시던트 1개 서피스**로 파일럿(신규면 편입 + 3자 대조 실동작 확인).
3. **P1 갭 착수:** 인증·관리(C2), RCA 규칙·보고서(C16). 계약 존재분은 UI 추가, 없으면 계약 PR.
4. **표면 일치 서피스 미러링:** 홈·리소스·상세·배포·비용의 데모 디자인 → dev 이식 + 필드 대조(원장 채우기).
5. **P2/P3 갭·데모 보강(dev→데모 예외):** 진단 세션·Provider 다단계·Release 보고서·Dead Letter·타임라인/알림 데모 보강.
6. **게이트 상시화:** `mirror-parity-check`를 Dev Gate에 편입해 이후 회귀 차단.

> 부록 확인 필요(🔷): C3 상태 렌더 실구현, C5 Provider 카탈로그/Scheduling UI, C11 데모 비교면, C14 Release 보고서/Export UI, C22 Dead Letter UI — 파일럿 단계에서 원장 채우며 확정.
