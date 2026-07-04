# KubeHeal 코드 리뷰 보고서

> 작성일: 2026-07-04
> 범위: dev 최신 HEAD 기준 코드 리뷰, 충돌 정정, 하드코딩, 이벤트 소비, 트랜잭션, LLM 기능 제안

---

## 1. 리뷰 기준

- 기준 브랜치: `dev`
- 확인 명령: `git fetch origin dev`, `git status --short --branch`
- 현재 상태: 로컬 `dev`와 `origin/dev` 동기화, Git conflict marker 없음
- 서비스 수: 31개 (`scripts/services.py` 기준)
- 이벤트 카탈로그: `scripts/events.py` 기준

이 문서는 이전 리뷰 초안의 오래된 주장과 최신 dev 변경 사항 사이의 충돌을 정리한 버전이다.

---

## 2. 이전 리뷰 초안에서 정정된 내용

### 2.1 이미 해결된 항목

| 이전 주장 | 최신 dev 기준 |
|-----------|---------------|
| `RcaAiFallbackRequestedBody` 소비자 없음 | `rca-fallback-worker/on_ai_fallback_requested` 존재. 단, 현재는 로깅 스텁 |
| `AlertDispatchedBody`, `AlertRejectedBody` 소비자 없음 | `alert-worker` 내부 소비자 존재. 단, 후속 재시도/에스컬레이션은 TODO |
| `DeadLetterCreatedBody` 소비자 없음 | `dead-letter-monitor/on_dead_letter_created` 존재. 단, 모니터링/재처리는 TODO |
| diff 위험도 문자열 비교 | `RiskLevel(StrEnum)` 기반으로 전환됨 |
| ManifestRenderer/AlertProvider/ScmProvider 없음 | `packages.contracts.*.provider/renderer` Protocol과 stub 구현이 들어감 |
| alert-worker에 provider 전략 패턴 없음 | `AlertProvider`, `StubAlertProvider`, `ALERT_PROVIDER` 팩토리 존재 |

### 2.2 아직 남은 의미 있는 리스크

해결된 항목 대부분은 "인터페이스 도입" 또는 "말단 소비자 추가" 단계다. 운영 기능 완성으로 보려면 실제 provider, 정책, 재처리 로직까지 연결해야 한다.

---

## 3. 대시보드 평가 정정

**결론: 이 백엔드 레포 기준 대시보드 구현은 0%에 가깝다.**

실제로 있는 것:
- `src/services/projection/audit-worker/app.py`: 감사 로그 적재 워커
- gateway settings의 `EVENT_STREAM_MEDIA_TYPE = "text/event-stream"` 상수
- 별도 프론트엔드 레포 존재 가능성

없는 것:
- DashboardCard 모델/리포지토리/라우터
- `/dashboard/query`, `/dashboard/stream`
- Dashboard Projection Worker
- SSE/WebSocket 구현

따라서 이전 보고서의 "대시보드 40%"는 이 레포의 백엔드 구현 상태로는 과대평가다.

---

## 4. 이벤트 소비 상태

### 4.1 소비자는 생겼지만 기능은 스텁인 이벤트

| 이벤트 | 소비자 | 현재 기능 | 남은 일 |
|--------|--------|-----------|---------|
| `rca.ai_fallback.requested` | `rca-fallback-worker` | 로그 기록 | LLM RCA 분석, 결과 이벤트 발행 |
| `dead_letter.created` | `dead-letter-monitor` | 경고 로그 | 알림, 재처리, 대시보드 노출 |
| `alert.dispatched` | `alert-worker` | 로그 기록 | 전송 결과 저장, 재시도/에스컬레이션 |
| `alert.rejected` | `alert-worker` | 로그 기록 | 거부 사유 추적, 운영 알림 |

### 4.2 소비자 없는 말단 이벤트

`scripts/events.py` 기준으로 `by=-` 이벤트가 남아 있다. 이 중 일부는 정상적인 API/조회용 말단 이벤트일 수 있으나, 운영 가시성 관점에서는 다음을 구분해야 한다.

- 정상 말단: `workflow.run.completed`, `workflow.run.failed`, `command.dispatched`처럼 read model 또는 audit로 충분한 이벤트
- 후속 기능 필요: `diff.explained`, `approval.recommended`, `rca.action_required`, `rca.rule_missing`

---

## 5. 하드코딩 및 인터페이스화 상태

### 5.1 좋아진 점

- DB timeout 계열은 env override가 가능해짐
- `ManifestRenderer`, `AlertProvider`, `ScmProvider` Protocol이 생김
- diff risk가 `RiskLevel(StrEnum)`으로 타입화됨
- `POLL_ONCE`는 명시적 truthy 파싱으로 수정됨

### 5.2 아직 남은 하드코딩/스텁

| 위치 | 현재 상태 | 위험 |
|------|-----------|------|
| `src/services/gitops/scm-worker/app.py` | `StubScmProvider`가 PR URL 합성 | 실제 PR 생성 없이 safe-pr 흐름이 성공처럼 보일 수 있음 |
| `src/services/alert/alert-worker/app.py` | `allow_after_alarm_gate()`가 항상 허용 | 운영 알림/승인 게이트가 사실상 없음 |
| `src/services/gitops/manifest-render-worker/app.py` | `DeploymentRenderer`가 기본 stub 렌더러 | Helm/Kustomize 미지원 |
| `src/services/gitops/diff-worker/app.py` | snapshot fallback 존재 | 승인 snapshot 누락 시 drift 과소 탐지 가능 |
| `deploy/**/*.yaml` | `service:local` 이미지 다수 | 운영 배포에는 태그 주입/overlay 필요 |
| `src/services/target/cluster-agent/agent.py` | fake telemetry 상수 유지 | 데모와 운영 경계 명확화 필요 |

---

## 6. 트랜잭션 및 대량 트래픽 검토

### 6.1 양호한 부분

- schema init advisory lock 사용
- workflow 상태 전이 guard 적용
- outbox/ledger claim으로 중복 처리 방지
- NATS consumer 설정의 env override 지원
- DB pool 관련 값 env override 지원

### 6.2 남은 병목 후보

| 영역 | 우려 | 제안 |
|------|------|------|
| audit-worker | 모든 이벤트를 단일 경로로 적재 | batch insert, 파티셔닝, TimescaleDB 검토 |
| outbox relay | 순차 처리 지연 가능 | 파티션별 병렬 claim 또는 relay worker scale-out |
| runtime schema migration | `ALTER TABLE` 런타임 수행 | Alembic 등 명시적 migration으로 이동 |
| evidence 폭주 | 클러스터/팟 수 증가 시 DB write 압력 | provider worker 수와 DB pool 동시 튜닝 |

20 클러스터 x 1000 pod 규모에서는 NATS보다 DB write path가 먼저 병목이 될 가능성이 크다.

---

## 7. LLM 기능 우선순위

### P0: 데모 전 필수

1. **AI RCA 폴백 실구현**
   - 현재: `rca-fallback-worker`가 이벤트를 소비하지만 로그만 남김
   - 목표: EvidenceBundle을 LLM으로 분석해 RCA 후보/근거/확신도 생성

2. **Diff 설명 생성**
   - 현재: `ai-diff-worker`와 `safe-pr.patch_prepared` 경계는 있으나 설명 품질 검증 필요
   - 목표: 리소스/필드/위험도를 사람이 읽을 수 있게 요약

### P1: MVP

1. Safe PR 패치 생성
2. 인시던트 보고서 자동 생성
3. 알림 메시지 생성
4. 증상 자동 분류
5. Diff 위험도 고도화

### P2 이후

1. 복구 계획 검증
2. 대화 컨텍스트 요약
3. 자연어 -> K8s 명령 변환
4. 로그 이상 탐지
5. 배포 영향 분석

---

## 8. 다음 액션

1. Dashboard 백엔드 범위를 명시하고 0%/미구현으로 정정
2. `StubScmProvider`, `StubAlertProvider`, `DeploymentRenderer`에 운영 모드 fail-fast 정책 추가
3. `rca-fallback-worker`를 로깅 스텁에서 LLM RCA 분석 워커로 전환
4. DLQ 모니터를 알림/재처리 큐와 연결
5. audit write path 부하 테스트 추가
