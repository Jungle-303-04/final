---
source_commit: 6abbbc8f4
status: synced
---

# OSS profile — PR-only controller + PostgreSQL + agent

> 구현 앵커: `src/controller/app.py`, `src/packages/runtime/controller.py`,
> `deploy/oss/kubeheal-oss.yaml`, `scripts/oss-demo.sh`.

이 프로파일은 공개 저장소의 첫 실행 경로다. 기존 `scripts/up.sh` 기반 다중 서비스 설치는
advanced profile로 남고, 기본 OSS 설치는 다음 3개 workload로 축소한다.

1. `kubeheal-controller` Deployment — API/realtime gateway, async loop 4개, event worker
   32개를 한 composition root에서 실행한다.
2. `kubeheal-postgres` StatefulSet — controller의 영속 저장소다.
3. `kubeheal-agent` DaemonSet — 클러스터 관측 agent다. read-only RBAC만 갖는다.

## 안전 기본값

| 환경변수 | 기본값 | 의미 |
|---|---|---|
| `CONTROLLER_EVENT_BUS_MODE` | `inprocess` | controller 내부 shared bus. `nats`는 advanced profile에서 명시 선택 |
| `AGENT_ACCESS_MODE` | `read_only` | OSS manifest의 agent RBAC는 get/list/watch만 허용 |
| `AGENT_DIRECT_COMMANDS_ENABLED` | `false` | telemetry query 외 agent command를 Kubernetes 호출 전에 거부 |
| `REMEDIATION_DELIVERY_MODE` | `pull_request` | remediation 전달은 PR만 사용 |
| `PRODUCTION_AUTO_MERGE_ENABLED` | `false` | production 자동 merge 비활성 |
| `RECONCILER_MODE` | `argocd` | OSS agent desired-state 루프는 observer-only, built-in apply 0건 |

process-local session store는 단일 controller용이며 restart 때 세션이 사라진다. HA, 장기 세션,
분산 rate limit이 필요한 배포는 Redis 기반 advanced profile을 사용한다. production auto-merge는
이 프로파일에서 제공하지 않는다.

## Composition root 검증

서비스 명부는 `src/services/*/*/app.py` 정적 발견 결과가 단일 원천이다. 지시 작성 당시
39개였지만 `change-correlation-worker` 착륙 후 현재 40개다. 숫자를 고정 목록으로 복제하지
않고 현재 실물을 매번 전수 배정한다: controller 38개, agent image 영역 2개
(`cluster-agent`, `node-collector`). controller 38개는 worker 32, async 4, HTTP 2다.

```bash
uv run python src/controller/app.py --check
```

명령은 모든 entrypoint를 실제 import하고 worker handler spec, async `run`, HTTP
`create_app` callable을 검증한 뒤 JSON count를 출력한다. 실제 기동은 `--check` 없이 실행한다.
in-process와 NATS 모드는 동일한 service signature와 handler spec을 사용하고 bus adapter만
바뀐다.

## 원커맨드 데모

```bash
make demo
```

실행 장면은 `kind-cluster-ready` → `bad-rollout-observed` →
`mock-rollback-pr-created` → `workload-normalized` 순이다. 로컬 mock PR은
`.demo-artifacts/rollback-pr.md`와 적용 가능한 `rollback.patch.yaml`을 만든다. 데모는
종료 시 Kind 클러스터를 삭제한다. 유지하려면 `DEMO_KEEP_CLUSTER=1`, 명령만 확인하려면
`DEMO_DRY_RUN=1`을 사용한다.

이 데모는 로컬 mock PR 경로이며 외부 SCM에 쓰지 않는다. agent 등록 token은
`deploy/oss/kubeheal-oss.yaml`의 예시 값을 실제 target registration에서 받은 token으로
교체해야 한다.
