# Opsia 문서

Opsia는 Kubernetes 장애 증거를 보존하고 제한된 변경안을 GitOps Draft PR로 제안한 뒤 배포 결과를 다시 검증하는 운영 제어면입니다.

## 역할별 시작점

- 민정: [Golden Path](./GOLDEN-PATH.md)에서 evidence 수집, RCA, Safe PR, verification이 이어지는 순서를 따라간다.
- 가인: [Project Map](./PROJECT-MAP.md)에서 현재 target, route surface, worker composition, provider 경계를 먼저 확인한다.
- 찬빈: [Cleanup Matrix](./CLEANUP-MATRIX.md)에서 command, dashboard, permission, GitOps 정리 우선순위와 삭제 gate를 확인한다.

현재 별도 민정/가인/찬빈 구현 온보딩 문서는 없다. 전용 onboarding을 추가하기 전까지는 위 세 문서가 역할별 시작점이다.

## 문서 입구

- [Golden Path](./GOLDEN-PATH.md): ImagePullBackOff 증거부터 배포 후 검증까지의 event·안전 계약
- [Project Map](./PROJECT-MAP.md): runtime, route, 저장소 디렉터리의 현재 책임
- [Cleanup Matrix](./CLEANUP-MATRIX.md): 제거한 제품 표면과 migration 호환을 위해 격리한 코드
- [Advanced Course Plan](./advanced-course-plan/README.md): 심화과정 팀 계획과 개인별 학습 계획

빠른 실행과 전체 검증 명령은 저장소 루트 [README](../README.md)를 기준으로 합니다.

## 키워드 입구

- command: 직접 실행 표면은 제거됐고 migration·retention 호환 스키마만 [Project Map](./PROJECT-MAP.md)에 남아 있다.
- target: 대상 클러스터에는 read-only `cluster-agent`만 두며 [Project Map](./PROJECT-MAP.md)이 현재 배포 경계를 설명한다.
- evidence: Kubernetes 증거 수집과 불변 조건은 [Golden Path](./GOLDEN-PATH.md)의 첫 단계다.
- RCA: 결정론적 YAML rule 기반 RCA와 실패 보존 계약은 [Golden Path](./GOLDEN-PATH.md)를 기준으로 한다.
- Safe PR: GitOps Draft PR, base SHA, source digest, verification 흐름은 [Golden Path](./GOLDEN-PATH.md)에 고정돼 있다.
- dashboard: 대형 dashboard는 제거됐고 필요한 read model만 [Cleanup Matrix](./CLEANUP-MATRIX.md)에 격리 근거로 남아 있다.
- permission: merge, 직접 cluster mutation, 쓰기 권한 경계는 [Golden Path](./GOLDEN-PATH.md)의 안전장치 표를 따른다.
- Bruno: 현재 `docs/api` Bruno collection은 없다. 추가하면 `tests {}`, `body:json {}`, `bru.setVar()` 문법을 import 기준으로 검증한다.
- AWS: 개인 AWS 배포 경로와 외부 터널 배포 경로 정리는 [Cleanup Matrix](./CLEANUP-MATRIX.md)의 삭제 항목으로만 설명한다.
- event: 실제 subject와 event body는 `src/packages/contracts/event_bus/subjects.py`와 `src/domains/*/events.py`를 source of truth로 삼고, 문서 요약은 [Golden Path](./GOLDEN-PATH.md)를 따른다.
- provider: `@telemetry.source(...)` provider는 현재 read-only Kubernetes snapshot provider가 기준이며 [Project Map](./PROJECT-MAP.md)에 경계가 있다.
- worker: 현재 worker/service 구성은 [Project Map](./PROJECT-MAP.md)과 `scripts/services.py` 출력이 기준이다.
- test: 회귀 검증 명령은 [Golden Path](./GOLDEN-PATH.md)의 검증 절과 `make check`를 따른다.
- GitOps: repository, manifest path, base SHA, Draft PR 경계는 [Golden Path](./GOLDEN-PATH.md)의 핵심 계약이다.
- realtime: WebSocket gateway와 realtime dashboard 표면은 제거됐고, 남은 timeline stream은 필요한 query/read model 경계에서만 유지한다.
