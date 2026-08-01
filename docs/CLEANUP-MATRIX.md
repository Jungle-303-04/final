# Cleanup Matrix

이 표는 현재 코드가 이미 삭제됐다는 선언이 아니다. 상태는 정리 판단이며, 실제 존재 여부는 [Project Map](./PROJECT-MAP.md)과 현재 코드가 기준이다.

상태 의미:

- `유지`: Golden Path에 직접 필요하며 대체 불가 근거가 있음
- `격리 후보`: 기본 경로에서는 호출하지 않도록 경계를 세우고, migration이나 기존 read model 때문에 임시 보존
- `삭제 후보`: 코드, route, service, 문서, 설정을 함께 제거해야 하는 표면
- `삭제 완료`: 현재 코드에서 해당 route/service/domain 표면이 빠졌으며 남은 표현은 계약·read model naming 정도로만 확인
- `실험 후보`: core 밖 plugin이나 연구 경로로 분리해야 하는 표면

| 감사 항목 | 상태 | 현재 코드 기준 처리 |
|---|---|---|
| 1. ImagePullBackOff Golden Path | 유지 | evidence, incident, RCA, Safe PR, SCM, verification worker와 관련 tests가 존재한다. |
| 2. 직접 클러스터 명령 실행 | 삭제 후보 | `domains.command`, command router, `command-worker`, `command-janitor`가 아직 존재한다. target-agent `commands/` adapter와 `src/services/target` service 표면은 현재 코드에 없다. |
| 3. dashboard와 timeline projection | 격리 후보 | `domains.dashboard`, `projection/dashboard-worker`, timeline stream/query code가 존재한다. Golden Path core 밖 read model로 둘지 삭제할지 별도 변경이 필요하다. |
| 4. realtime, terminal, port-forward | 삭제 후보 | `realtime-gateway`와 terminal/port-forward broker code가 존재한다. evidence live stream 외 표면은 PR-only 안전 경계와 별도로 검토한다. |
| 5. node collector와 target reconcile/drift | 삭제 완료 | `src/services/target/node-collector`, `target-drift-worker`, `target-reconcile-worker`, `src/domains/target`은 현재 코드에 없다. 남은 target 문자열은 계약·read model naming인지 별도로 확인한다. |
| 6. 광범위한 CD orchestration | 격리 후보 | release-flow, workflow-controller, diff/render/poll, auto-revert worker가 존재한다. Safe PR source authority와 webhook lifecycle에 필요한 최소 계약만 분리해야 한다. |
| 7. AI chat과 fallback | 실험 후보 | `chat-worker`, `ai-fallback-worker`, `domains.ai`가 존재한다. 결정론적 RCA의 source of truth로 쓰지 않는다. |
| 8. Mail, cost, catalog, filter 계열 | 삭제 후보 | mail worker/domain, cost, catalog, 여러 filter/explorer router가 존재한다. core evidence → RCA → PR → verification 흐름 밖이다. |
| 9. 개인 AWS 및 외부 터널 배포 경로 | 삭제 후보 | 개인 infra/deploy/script 표면은 공개 core와 분리한다. 필요한 경우 문서에서는 "외부 기준 저장소", "벤치마크 최소선", "외부 터널" 같은 일반 표현만 쓴다. |
| 10. `.gitops` 실행 산출물 | 삭제 후보 | runtime 산출물은 source와 분리하고 재추적되지 않게 관리한다. 소스의 `.gitops/safe-pr` 문자열은 대상 GitOps 저장소 안에 생성할 review 문서/patch 경로 계약일 수 있다. |
| 11. 과거 제품명과 실험 코드 | 삭제 후보 | 과거 제품명, demo workspace, 참조 기능 catalog는 실제 코드가 남아 있는 동안 완료로 쓰지 않는다. |

## 삭제 Gate

삭제 후보를 "삭제 완료"로 바꾸려면 같은 변경에서 다음을 확인한다.

- route 상수, router include, request/response DTO, worker `@app.on(...)` 또는 `@app.on_any`가 함께 정리된다.
- event subject/body가 남는다면 migration, retention, replay 이유를 문서에 쓴다.
- target-agent provider 또는 command adapter가 다시 추가된다면 active agent wiring 여부를 분리해서 설명한다.
- Bruno collection이 추가된 경우 `tests {}`, `body:json {}`, `bru.setVar()` import 문법을 통과한다.
- `uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py -q`와 가능한 manifest/test gate를 통과한다.

## 보존 판단

- read-only Kubernetes RBAC와 manifest gate: Golden Path evidence 수집 권한의 최소선
- deterministic cause catalog: evidence signal과 RCA 결론을 재현 가능하게 연결
- GitOps authority/source patch: repository, manifest path, base SHA, source digest를 고정하는 안전 경계
- GitHub SCM worker: 직접 변경 대신 검토 가능한 Draft PR을 만드는 쓰기 경계
- recovery verification worker: 배포 후 evidence 재수집과 terminal outcome 기록
