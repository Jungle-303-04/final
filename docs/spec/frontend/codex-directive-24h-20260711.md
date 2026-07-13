---
title: 24시간 압축 실행 지시서 (검토자 → Codex)
status: archived — 현재 작업에 참조 금지
date: 2026-07-11
subordinate_to: codex-directive-reference-pivot-20260711.md
deadline: 2026-07-12T23:59+09:00 (24시간)
---

# 24시간 압축 실행 지시서

## 0. 배경과 효력

이 문서는 `codex-directive-reference-pivot-20260711.md`에 종속된다. 메트릭, RCA, 리커버리,
실 API 연결, 등록처럼 뷰와 무관한 작업만 계속 유효하며, 철회된 중앙 뷰 계획과 그 순서는 유효하지 않다.

실제 클러스터 데이터로 메트릭이 보이고, 인시던트에 복구 계획이 붙고,
프론트엔드가 백엔드와 실 연동되는 상태가 24시간 안에 달성되어야 한다.

우선순위 (사용자 지정):
1. **메트릭 실제 세팅 + 적용** — 가장 중요
2. **리커버리 플랜 설계 + 반영**
3. **프론트엔드 ↔ 백엔드 실 데이터 연결**
4. 배포 → 테스트 → 폴리싱 반복

## 1. 24시간 압축 일정

총 24시간을 6블록으로 나눈다. 각 블록은 완료 게이트를 통과해야 다음으로 간다.
**병렬 가능한 작업은 병렬로 실행한다.**

### Block A (0~3h): 기반 + 프록시 + 메트릭 데이터 경로

목표: 프론트가 실제 백엔드 API에 인증된 상태로 접근 가능

작업:
1. vite proxy에 `cookieDomainRewrite` 추가 — 401 루프 해소
2. `react-router-dom` 추가, `ProductRouter.tsx` + `ProductShell.tsx` 뼈대
3. 메트릭 페이지 데이터 경로 3종 연결 확인:
   - 실시간 WS (`/api/live/browser`)
   - 스냅샷 시계열 (`GET /clusters/{id}/usage`) — 30초 주기
   - 온디맨드 PromQL (`POST /agent/debug/query` → `GET /commands/{id}` 폴링)
4. PromQL 프리셋 6종 실행 가능 상태 확인:
   - 노드 CPU/메모리/파일시스템 사용률
   - 팟 재시작율
   - 네임스페이스별 팟 수
   - sandbox 디플로이 레플리카

게이트:
- `npm run check` 통과
- proxy 경유 `/api/auth/session` 200 응답
- `/api/clusters` 실 데이터 반환

### Block B (3~8h): 메트릭 대시보드 + 클러스터 홈

목표: `/metrics` 페이지에서 실제 클러스터 메트릭이 차트로 보임

작업:
1. 클러스터 selector — `GET /api/clusters` 응답의 실제 cluster_id/name만 사용
2. 스냅샷 usage 롤업 시계열 차트 (pod_total/running/pending/failed, node_total/ready, cpu_pct/mem_pct)
3. PromQL 프리셋 카드 — 각 프리셋 실행 + 결과 series/points 시각화
4. 실시간 WS 연결 — 연결 상태 배지(연결됨/끊김/재연결 — 장식용 "LIVE" 배지 아님,
   HANDOVER §6.11 준수) + 실시간 차트
5. 실패/agent 오류 시 실패 배지 + 재시도 버튼
6. Home 기본 뷰: 클러스터 선택 → usage 요약 StatBox + 차트

게이트:
- `cluster-1` 선택 시 실제 메트릭 데이터가 차트에 렌더됨
- PromQL 프리셋 최소 3종 실행 성공 + 결과 표시
- 가짜 데이터 0건 (MOCK/synthetic/하드코딩 금지)

### Block C (8~12h): 인시던트 + RCA + 리커버리 플랜

목표: 인시던트 상세에 RCA 분석 + 복구 계획이 표시됨

작업:
1. 인시던트 목록 (`GET /api/dashboard/rca/timeline`) 연결
2. 인시던트 상세 분석 필드 표시:
   - 대상 리소스 (namespace/resource_kind/resource_name)
   - 대표 증상 + secondary_symptoms
   - 후보 평가: 점수(0~1), 판단 사유, 충족/미충족 증거
   - selected_candidate_id 최종 선정 하이라이트
   - 근거 트레일: source별 쿼리 + 요약
   - 미수집 체크: 부족 증거 + 사유
3. **리커버리 플랜 연결** (검증자 확인: 조회 API **이미 존재** — 신설 금지):
   - `GET /rca/recovery-plans/by-correlation/{correlation_id}` 조회 +
     `POST /rca/recovery-plans/{plan_id}/actions/{action_id}/select` 선택
     (`src/packages/contracts/gateway/routes.py:113-114`)
   - 인시던트 상세에 "복구 조치" 섹션 추가
   - 복구 상태(pending/approved/executing/completed/failed) 표시
   - 복구 액션 내용 + 승인 상태 표시
   - 플랜 없는 인시던트는 "복구 계획 미생성"으로 정직 표시
4. 증거 패널 (`GET /evidence?correlation_id=`) — kind 필터

게이트:
- 실제 인시던트의 RCA 보고서가 UI에 렌더됨
- 복구 계획 섹션이 인시던트 상세에 표시됨
- 증거 트레일의 실행 쿼리가 그대로 보임

### Block D (12~17h): 등록 + 인벤토리 + 네비게이션

목표: 전체 IA가 실 데이터로 동작

작업:
1. 클러스터 등록 플로우 (provider catalog → preflight → register → bootstrap → connection-status)
2. P1에서 확인한 외부 기준 저장소 IA와 P2에서 `직결 가능` 또는 `어댑터 필요`로 확정된 범위의 인벤토리 연결
3. capability 없는 항목은 disabled로 만들지 않음
4. GitOps 데이터 경로 (applications, release-plans, release-runs 연결)
5. Timeline 데이터 경로 (이벤트 + 인시던트 생명주기)

게이트:
- 등록 위저드에서 실 provider catalog 표시
- Resources에서 `cluster-1` pod/node 목록 표시
- 사이드바 네비게이션 동작

### Block E (17~21h): 시각 품질 + 테마 + 반응형

목표: 프로덕션 품질 UI

작업:
1. 라이트/다크 테마 동작
2. 반응형: 390px / 768px / 1024px / 1440px
3. 로딩/빈 상태/에러 상태 처리
4. 키보드 네비게이션 기본
5. reduced motion 지원
6. AI 삽입 후보:
   - Home attention 요소 (인시던트 배지 → RCA 내러티브)
   - Resources 인라인 "AI 분석" 섹션
   - 전역 채팅 드로어 (conversation API 연결)

게이트:
- 다크/라이트 모드 전환 동작
- 모바일(390px)에서 깨지지 않음
- `npm run check` + `npm run visual-product` 통과

### Block F (21~24h): 실측 검증 + 배포 + 마무리

목표: `cluster-1` 실 데이터로 전체 플로우 검증 완료

작업:
1. 실제 `cluster-1` 연결 상태에서 전체 플로우 스크린샷
2. 메트릭 6종 프리셋 전부 실행 + 결과 확인
3. 인시던트 → RCA → 복구 플랜 플로우 확인
4. 빌드 최적화 (500kB chunk 경고 해소)
5. 최종 `npm run check` + `npm run visual-product`
6. 커밋 정리 + PR 준비

게이트:
- 가짜 데이터 0건, DEMO DATA 라벨 0건
- 401 루프 0건
- 전체 빌드 성공
- 실 데이터 스크린샷 존재

## 2. 핵심 규칙 (기존 지시서에서 재확인)

1. synthetic/replay/가짜 리소스 이름 금지
2. zod 스키마 엄격 + summary open record, raw 금지
3. proxy cookie 보존 — 401 시 우회 코드 넣지 말고 blocked 보고
4. 동적 cluster selector와 `?cluster=` 보존, 접근 불가 ID 자동 교정 금지
5. 제품 view가 transport를 직접 호출하지 않고 `src/product/api/**`만 사용
6. 화면 포팅 순서는 외부 기준 저장소 P1 전수표와 P2 계약 매핑 게이트를 따른다

## 3. 보존된 뷰-비의존 결정

| # | 결정 |
|---|---|
| 1 | Pod UID가 필요한 기능은 non-null refine, inventory key로 조용히 대체 금지 |
| 2 | raw 금지, summary만 명시된 open record |
| 3 | client refresh 지연과 backend freshness 분리 |
| 4 | react-router-dom nested shell |
| 5 | Vitest + seeded deterministic property loop |
| 6 | frontend release registry와 capability가 메뉴 권위 |
| 7 | 모든 접근 가능한 cluster를 selector에 유지, non-online 상태를 정직하게 표시 |
| 8 | `?cluster=` URL 보존, 접근 불가 ID는 명시 오류 |

## 4. 메트릭 쿼리 참조 (즉시 사용)

### PromQL 프리셋 6종

```
노드 CPU:     1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))
노드 메모리:   1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)
노드 FS:      1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"} / node_filesystem_size_bytes{...})
팟 재시작:     sum by (namespace) (rate(kube_pod_container_status_restarts_total[5m]))
NS별 팟:      count by (namespace) (kube_pod_info)
sandbox 레플:  kube_deployment_status_replicas{namespace="sandbox"}
```

### 스냅샷 usage 필드

pod_total/running/pending/failed, restart_total, node_total/ready, cpu_pct/mem_pct

### 데이터 경로

- 실시간: WS `/api/live/browser`
- 스냅샷: `GET /clusters/{id}/usage` (30초)
- PromQL: `POST /agent/debug/query` → `GET /commands/{id}` 폴링

## 5. 리커버리 플랜 설계 지침

`recovery_plans` 테이블과 **조회·선택 API가 이미 존재한다** — 새 endpoint를 만들지 않는다.

1. **조회 API**: `GET /rca/recovery-plans/by-correlation/{correlation_id}`,
   선택은 `POST /rca/recovery-plans/{plan_id}/actions/{action_id}/select`
   (`routes.py:113-114`, 검증자 확인 2026-07-11)
2. **UI 섹션**: 인시던트 상세 하단에 "복구 조치" 카드
   - 복구 액션 종류 (scale, restart, rollback 등)
   - 대상 리소스
   - 상태 (pending → approved → executing → completed/failed)
   - 승인 정보
3. **projection worker 수정이 필요하면**: 범위를 최소화하고, 없는 데이터는 "복구 계획 미생성"으로 정직하게 표시

## 6. 시간 부족 시 삭감 순서 (트리아지 — 이 순서 외 임의 삭감 금지)

1. 라이트 테마 → 다크 단일로 출시, 라이트는 후속.
2. GitOps·Timeline 뷰 → 목록 최소형(카드 없이 행 목록)으로 축소.
3. AI 채팅 드로어 → 후속(단, 인시던트 RCA 내러티브는 삭감 불가 — 우선순위 2).
4. 등록 위저드 → catalog·register·bootstrap 표시·polling의 직선 경로만(고급 검증 UI 축소).

삭감 발생 시 `codex-progress-20260711.md`에 항목과 사유를 기록한다.

## 7. 착수

외부 기준 저장소 피벗 이후 작업 순서는 P1 전수표 → P2 계약 매핑 → 검토자 승인 → P3·P4다.
이 문서의 미완료 뷰-비의존 항목은 해당 순서를 침범하지 않는 범위에서 수행한다.
각 Block 완료 시 게이트 결과(명령+출력 요약, 커밋 해시)를 `codex-progress-20260711.md`에
append한다. Block B (메트릭 대시보드) 완료가 최우선이다.
