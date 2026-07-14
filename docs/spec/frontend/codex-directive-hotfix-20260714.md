---
title: 긴급 수정 지시서 — 5개 블로커 즉시 해소 (검토자 → Codex)
status: active-directive
date: 2026-07-14
priority: 이 지시서의 모든 항목은 화면 구현보다 먼저 완료한다
authority: VP-015/VP-016보다 우선, codex-directive-goalmode 보충
---

# 긴급 수정 지시서 — 5개 블로커 즉시 해소

감사 보고서(audit-report-20260714.md)에서 critical 3건 + major 블로커 2건이 발견됐다.
이것들이 해결되지 않으면 화면 구현을 시작해도 전부 잘못된 방향으로 간다.
**화면 슬라이스(S1~S17) 착수 전에 이 5개를 먼저 완료하라.**

---

## 1. codex-directive-goalmode §1 allowlist 갱신 [5분]

### 문제
VP-015, VP-016, radar-parity-map이 활성 문서 allowlist에 없다.
"allowlist 밖 문서를 참조한 구현은 게이트 위반"이므로 코덱스가 화면 골격 정본을 참조할 수 없다.

### 지시
`codex-directive-goalmode-20260711.md` §1 allowlist에 다음 3개를 추가하라:

```
10. `vp-015-global-shell.md` (화면 골격 정본 — 충돌 시 이 문서가 이긴다)
11. `vp-016-delivery-plan.md` (수직 슬라이스 배포 계획)
12. `radar-parity-map.md` (외부 기준 소스 대조)
```

또한 다음 조항을 §1 마지막에 추가하라:
```
이후 frontmatter에 `status: spec-approved`가 달린 문서는 자동으로 allowlist에 편입된다.
별도 갱신 커밋 없이 참조할 수 있다.
```

### 완료 조건
- allowlist가 12개 항목으로 갱신됨
- `npm run check` 통과
- 커밋 메시지: `docs: allowlist에 VP-015/016/radar-parity-map 추가`

---

## 2. API 완성 게이트 데드락 해소 [30분]

### 문제
§6b 시스템: "API 완성: 목록에 오른 함수만 소비". 그런데 API를 승인할 작업자가 없다.
`api-needs.md`에 26개 요청이 전부 `requested` 상태. 화면은 release gate만 표시.
**이 데드락이 풀리지 않으면 화면 구현이 영원히 시작되지 않는다.**

### 지시

#### 2-A. 이미 구현된 API 함수 일괄 승인
`src/product/api/` 에 이미 존재하는 함수들을 `codex-progress-20260711.md` 끝에 다음 형식으로 등록하라:

```
API 완성: getSession (auth.ts)
API 완성: login (auth.ts)
API 완성: logout (auth.ts)
API 완성: listClusters (fleet.ts)
API 완성: getFleetSummary (fleet.ts)
API 완성: getClusterUsage (clusters.ts)
API 완성: getClusterDetail (clusters.ts)
API 완성: listInventoryResources (inventory.ts)
API 완성: getInventoryResource (inventory.ts)
API 완성: getRcaTimeline (rca.ts)
API 완성: getRcaIncident (rca.ts)
API 완성: getRecoveryPlansByCorrelation (rca.ts)
API 완성: selectRecoveryAction (rca.ts)
API 완성: getEvidence (rca.ts)
API 완성: queryPrometheus (metrics.ts)
API 완성: executePromQLPreset (metrics.ts)
API 완성: subscribeLive (live.ts)
```

#### 2-B. api-needs.md 상태 갱신
위에서 승인한 함수에 대응하는 `api-needs.md` 행의 status를 `requested` → `approved` 로 변경하라.

#### 2-C. 24시간 규칙 즉시 적용
§6b의 "24시간 경과 미처리 요청만 Codex가 직접 구현" 규칙에 따라,
2026-07-11에 요청된 항목은 이미 72시간 이상 경과했다.
**남은 미승인 함수는 Codex가 직접 구현할 수 있다.**
이 사실을 progress에 기록하고 필요한 함수를 직접 구현하라.
단, `client.ts`와 `url.ts`는 절대 수정 금지. workorder의 7단계 레시피와 5계명을 따른다.

### 완료 조건
- progress에 `API 완성:` 앵커 17개 이상
- api-needs.md에 `requested` 0행 (전부 `approved` 또는 `self-implemented`)
- `npm run check` 통과
- 커밋 메시지: `feat: API 완성 게이트 일괄 승인 + 데드락 해소`

---

## 3. 상세 패널 — Sheet → 전체화면 교체 [반나절]

### 문제
VP-015 §5.2 확정: "열면 곧바로 전체화면으로 목록을 덮는다. 480px 중간 상태 없음. 드래그 리사이즈 없음."
실제 코드 `ResourceDetailSheet.tsx`: shadcn `Sheet(side="right")` 사용, `full` prop으로 2단계 폭 전환.
**폐기된 3단계 패턴의 잔재.**

### 지시
1. `ResourceDetailSheet.tsx`를 `ResourceDetailOverlay.tsx`로 리네임
2. Sheet 컴포넌트 대신 **전체화면 오버레이**로 재작성:
   - 열림 시: 콘텐츠 영역 전체를 차지 (사이드바 56px 레일만 남김)
   - `full` prop 제거 — 상태는 닫힘/열림 둘뿐
   - 드래그 리사이즈 제거
3. 사이드바 연동: 상세 열림 시 사이드바를 56px 레일로 축소. 닫힘 시 복원.
4. URL: 현재 코드의 `?resource=&resourceKind=` 구조를 **정본으로 유지**.
   VP-015 §5.2의 `?detail=kind/ns/name` 형식은 **코드에 맞춰 갱신할 예정**이므로 코드를 바꾸지 않는다.
5. `history.pushState`로 상세 열림/닫힘 관리. 뒤로가기 = 닫기.
6. 포커스 트랩: 열림 시 상세 내부로 포커스 가둠. Esc = 닫기 + 원래 행 포커스 복귀.
7. J/K 키보드 네비게이션: 상세 열린 상태에서 다음/이전 항목 이동.
8. **상세 상단에 네비게이션 바 추가**: `← 이전 (K) · 3/47 · 다음 (J) →` 형태. 클릭으로도 이동 가능.

### 완료 조건
- Sheet 컴포넌트 import 0건 (상세 패널에서)
- 상세 열림 시 콘텐츠 영역 100% 차지
- 사이드바 56px 레일 축소 동작
- J/K + 네비게이션 바 동작
- Esc 포커스 복귀
- `npm run check` 통과
- 커밋 메시지: `feat(S6): 상세 패널 전체화면 교체 — VP-015 §5.2 확정 반영`

---

## 4. 유령파드 — 비낙관 규칙 충돌 해소 [1시간]

### 문제
VP-016 S13: "제출 즉시 점선 유령 파드가 뜬다" (낙관적 패턴).
codex-directive §3 + final-questions 확정: "receipt 기반 비낙관 처리" (비낙관 패턴).
직접적 모순.

### 지시
다음 정의를 `codex-directive-goalmode-20260711.md` §3 기본 결정 규칙 표에 행으로 추가하라:

```
| 유령파드 | 비낙관 규칙의 예외가 아니라 `pending` 상태의 시각적 표현이다. 유령파드는 데이터를 확정(committed)으로 처리하지 않으며, `submitted` → `pending` → `applied` / `failed` 상태 전이를 정직하게 보여준다. 서버 확인 없이 성공으로 표시하는 것이 금지되는 것이지, 예정 상태를 시각화하는 것은 허용된다. |
```

또한 VP-016 S13에 다음 주석을 추가하라:
```
> 유령파드는 낙관적 확정이 아니다. "이만큼 될 예정이다"를 보여주되, 점선+맥동으로
> "아직 확정이 아님"을 정직하게 표현한다. applied 이벤트 수신 전에 실선으로
> 바꾸거나 성공 표시를 하면 게이트 위반이다.
```

### 완료 조건
- codex-directive §3 테이블에 유령파드 행 추가
- VP-016 S13에 비낙관 호환 주석 추가
- 커밋 메시지: `docs: 유령파드-비낙관 충돌 해소 — pending 상태 정의 추가`

---

## 5. 중복/하드코딩 6건 정리 [2시간]

### 지시

#### 5-A. PromQL 하드코딩 제거
`features/metrics/presets.ts`에서 `namespace="sandbox"`를 파라미터로 변경:
```typescript
// before
`sum(rate(container_cpu_usage_seconds_total{namespace="sandbox"}[5m]))`

// after
`sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}"}[5m]))`
```
프리셋 함수가 `namespace: string` 파라미터를 받도록 시그니처 변경.

#### 5-B. nullableStringSchema 중복 제거
`schemas.ts`에 한 번만 정의하고, `cluster-schemas.ts`와 `inventory-schemas.ts`에서 import.

#### 5-C. TELEMETRY_QUERY_ACTION 중복 제거
`metrics.ts`에서만 정의하고 `telemetry.ts`에서 import. 또는 `metrics-constants.ts`로 분리.

#### 5-D. cluster_id 유효성 통일
공통 스키마 추가:
```typescript
export const clusterIdSchema = z.string().min(1, "cluster_id는 빈 문자열 불가");
```
모든 스키마 파일에서 이 공통 스키마를 사용.

#### 5-E. PrometheusQueryDefinition 이중 타입 제거
Zod `infer` 타입만 유지. 수동 `interface` 삭제.

#### 5-F. Error→Failure 매핑 추출
`shared/error-mapper.ts`로 추출하고 `home/adapter.ts`, `resources/adapter.ts`에서 import.

### 완료 조건
- 각 항목별 중복 0건 확인
- `npm run check` 통과
- 커밋 메시지: `refactor: 중복/하드코딩 6건 정리 — audit-report 반영`

---

## 실행 순서

```
1 → 2 → 4 → 5 → 3
```

1(allowlist)과 2(API 데드락)가 풀려야 화면 구현이 가능하고,
4(유령파드 정의)와 5(중복 정리)는 코드 품질 기반이고,
3(상세 패널)은 가장 공수가 크지만 S6 슬라이스의 핵심이다.

**5개 완료 후 VP-016 S1(클러스터 목록)부터 수직 슬라이스를 시작하라.**
