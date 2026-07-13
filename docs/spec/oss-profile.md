---
source_commit: e480b3246
status: synced
---

# OSS profile — PR-only controller + PostgreSQL + agent

> 구현 앵커: `src/controller/app.py`, `src/packages/runtime/controller.py`,
> `charts/opsia/`, `scripts/oss-demo.sh`.

이 프로파일은 공개 저장소의 첫 실행 경로다. 기존 `scripts/up.sh` 기반 다중 서비스 설치는
advanced profile로 남고, 기본 OSS 설치는 다음 3개 workload로 축소한다.

1. `opsia-controller` Deployment — API/realtime gateway, async loop 4개, event worker를
   한 composition root에서 실행한다.
2. `opsia-postgresql` StatefulSet — controller의 영속 저장소다.
3. `opsia-agent` DaemonSet — 클러스터 관측 agent다. read-only RBAC만 갖는다.

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
39개였지만 후속 worker 착륙 후 현재 41개다. 숫자를 고정 목록으로 복제하지 않고 현재
실물을 매번 전수 배정한다: controller 39개, agent image 영역 2개
(`cluster-agent`, `node-collector`). controller 39개는 worker 33, async 4, HTTP 2다.
H3의 `auto-revert-worker` 합류로 BQ-016 착륙 시점보다 worker가 1개 늘었다.

```bash
uv run python src/controller/app.py --check
```

명령은 모든 entrypoint를 실제 import하고 worker handler spec, async `run`, HTTP
`create_app` callable을 검증한 뒤 JSON count를 출력한다. 실제 기동은 `--check` 없이 실행한다.
in-process와 NATS 모드는 동일한 service signature와 handler spec을 사용하고 bus adapter만
바뀐다.

## 접속 계약

UI, REST API, agent HTTP/WebSocket은 하나의 Service 80/443 origin을 사용한다. Console의
Nginx가 `/api/`와 `/api/live/`를 controller의 내부 8000/8001 포트로 전달한다. metrics 9090과
PostgreSQL 5432는 별도 ClusterIP Service로만 제공한다. 기본 edge 요청 상한은 2MiB이고 inventory
snapshot 경로만 agent와 동일한 16MiB 상한을 사용한다.

| `access.mode` | 외부 노출 | 주소 계약 |
|---|---|---|
| `auto` | IngressClass+host면 ingress, cloud providerID면 LoadBalancer, 그 외 port-forward | 판정 결과를 NOTES에 출력 |
| `portforward` | ClusterIP | 외부 URL이 없으므로 management self cluster만 등록 가능 |
| `loadbalancer` | LoadBalancer Service | `access.externalUrl` 필요. HTTPS는 `access.loadBalancer.tlsTermination=external` 명시 필수 |
| `ingress` | Ingress + ClusterIP | `access.host` 필수. TLS 사용 시 secret 이름 필수 |
| `nodeport` | NodePort Service | `access.nodePort`는 Kubernetes NodePort 범위만 허용 |

`access.externalUrl`은 userinfo, path, query, fragment, 빈 host, 문자열 포트, 0 또는 65535 초과
포트를 거부한다. LoadBalancer의 external TLS는 provider-neutral 운영자 계약이다. 차트가 인증서를
만들지 않으며, `access.loadBalancer.annotations`로 cloud LB 설정을 전달하고 HTTPS를 Service 80의
plain HTTP로 종료했다는 사실을 명시해야 렌더가 진행된다. Console CSP의 연결 출처는 `'self'`만
허용한다.

외부 URL이 없는 기본 설치는 `http://opsia.<namespace>.svc`를 self-agent 주소로 사용한다.
preflight와 등록 응답의 `management_access.reachability`는 `self_only`이고 target role의 다른
클러스터 등록은 422로 거부된다. Ingress 또는 LoadBalancer 주소가 있으면 서버가 확정한 주소를
요청 body보다 우선하며 설치 명령의 server URL에 사용한다. localhost를 추측하지 않는다.

초기 관리자 이메일과 무작위 비밀번호는 `<release>-bootstrap` Secret에 생성되며 NOTES는 값을
직접 출력하지 않고 조회 명령만 제공한다. `DEV_AUTH_BYPASS`는 이 프로파일에서 항상 `0`이다.
`/api/install/<token>`은 URL 자체가 자격증명이므로 Nginx와 Uvicorn access log에 원문을 남기지
않는다. 현재 토큰 수명 계약은 별도 단기 receipt로 교체할 후속 보안 항목이다.

## 원커맨드 데모

```bash
make demo
```

실행 장면은 `kind-cluster-ready` → `opsia-installed` → `bad-rollout-observed` →
`safe-pr-requested` → `safe-pr-created` → `review-merged` → `gitops-sync-applied` →
`workload-normalized` 순이다. API 로그인, application 등록, manifest render, DB outbox,
in-process worker chain, 기존 `GithubScmProvider`, `scm-worker`를 실제로 거치며
`audit_log.safe_pr.created`의 URL을 관측한 뒤에만 다음 단계로 간다.

SCM은 `make demo` 전용 GitHub-compatible fixture지만 branch·file·review merge는 실제 Git
commit으로 남는다. controller에는 writer token만 주입하고 harness-admin의 main seed/incident
commit과 reviewer merge는 서로 다른 임시 token으로 분리한다. reviewer는 관측한 PR의 exact
base/head SHA를 함께 제출하며 중간 revision 변경은 409로 거부된다. `.git` metadata 경로는
모든 depth에서 차단한다.

리뷰 merge 뒤에는 merge SHA의 exact manifest를 다시 읽어 Opsia 바깥의
`opsia-demo-gitops` actor가 server-side apply한다. 종료 조건은 Ready/image뿐 아니라
Deployment `managedFields`에서 spec의 Apply writer가 이 actor 하나인지도 확인한다. 이것은
PR-only/single-writer 경계를 재현하는 로컬 시뮬레이션이며 실제 외부 GitOps controller의 continuous
reconcile이나 rollout 진단부터 PR 생성까지의 완전 자율 흐름을 증명하지 않는다.

증거 파일의 기본 위치는 실행마다 새 `/tmp/opsia-demo-artifacts.*` 디렉터리다. bootstrap
password와 session cookie, SCM capability token은 증거에 저장하지 않고 종료 시 삭제되는
0600 runtime 디렉터리에서만 사용한다. 지정한 `DEMO_ARTIFACT_DIR`가 비어 있지 않으면 stale
성공 증거를 재사용하지 않고 실패한다. 데모는 종료 시 Kind 클러스터를 삭제한다. 유지하려면
`DEMO_KEEP_CLUSTER=1`, 명령만 확인하려면 `DEMO_DRY_RUN=1`을 사용한다.

공개 OCI chart URL과 controller/console artifact의 anonymous pull은
2026-07-13 실측에서 403이었다. 외부 container registry chart publish와 세 image package의 anonymous pull 허용 뒤
fresh Kind에서 공개 명령을 다시 실행해야 한다. 현재 로컬 chart 실증은
hosted SCM review, 실제 외부 GitOps controller reconcile은 확인되지 않았다. 그러므로 이 로컬 실증은
공개 배포 완료 판정이나 BQ-016 완료 앵커가 아니다.
