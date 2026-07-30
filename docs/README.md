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
- [Cleanup Matrix](./CLEANUP-MATRIX.md): 남아 있는 넓은 제품 표면의 유지·격리·삭제 판단
- [Advanced Course Plan](./advanced-course-plan/README.md): 심화과정 팀 계획과 개인별 학습 계획

빠른 실행과 전체 검증 명령은 저장소 루트 [README](../README.md)를 기준으로 합니다.

## 키워드 입구

- command: `domains.command`, command worker, command API router, target-agent command adapter가 아직 코드에 남아 있으며 [Cleanup Matrix](./CLEANUP-MATRIX.md)의 삭제 후보로 다룬다.
- target: active `TargetClusterAgent`는 read-only evidence scheduler와 Kubernetes snapshot provider만 wire하며, 남은 command adapter와 reconcile/drift 표면은 [Project Map](./PROJECT-MAP.md)에서 분리해 설명한다.
- evidence: Kubernetes 증거 수집과 불변 조건은 [Golden Path](./GOLDEN-PATH.md)의 첫 단계다.
- RCA: 결정론적 YAML rule 기반 RCA와 실패 보존 계약은 [Golden Path](./GOLDEN-PATH.md)를 기준으로 한다.
- Safe PR: GitOps Draft PR, base SHA, source digest, verification 흐름은 [Golden Path](./GOLDEN-PATH.md)에 고정돼 있다.
- dashboard: dashboard API, dashboard worker, timeline stream code가 아직 남아 있으며 Golden Path 밖 read model 또는 삭제 후보로 [Cleanup Matrix](./CLEANUP-MATRIX.md)에서 추적한다.
- permission: merge, 직접 cluster mutation, 쓰기 권한 경계는 [Golden Path](./GOLDEN-PATH.md)의 안전장치 표를 따른다.
- Bruno: 현재 `docs/api` Bruno collection은 없다. 추가하면 `tests {}`, `body:json {}`, `bru.setVar()` 문법을 import 기준으로 검증한다.
- AWS: 개인 AWS 배포 경로와 외부 터널 배포 경로 정리는 [Cleanup Matrix](./CLEANUP-MATRIX.md)의 삭제 항목으로만 설명한다.
- event: 실제 subject와 event body는 `src/packages/contracts/event_bus/subjects.py`와 `src/domains/*/events.py`를 source of truth로 삼고, 문서 요약은 [Golden Path](./GOLDEN-PATH.md)를 따른다.
- provider: `@telemetry.source(...)` module은 Kubernetes, Prometheus, Loki, Tempo, Metadata가 존재하지만 active agent 기본 provider는 Kubernetes snapshot 하나다.
- worker: 현재 worker/service 구성은 [Project Map](./PROJECT-MAP.md), `src/services/**/app.py` decorator, `scripts/services.py` 출력이 기준이다.
- test: 문서/Bruno 회귀는 `uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py -q`, Golden Path 회귀는 [Golden Path](./GOLDEN-PATH.md)의 pytest 묶음과 `make manifest-check`를 기준으로 한다. 현재 `make check` target은 없다.
- GitOps: repository, manifest path, base SHA, Draft PR 경계는 [Golden Path](./GOLDEN-PATH.md)의 핵심 계약이다.
- realtime: `realtime-gateway`, browser/agent WebSocket, terminal/port-forward broker code가 아직 존재하며 [Project Map](./PROJECT-MAP.md)과 [Cleanup Matrix](./CLEANUP-MATRIX.md)에 현재 상태를 둔다.
