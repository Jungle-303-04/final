---
title: AWS dev 배포 드리프트 감사
status: blocking-first-deploy
observed_at: 2026-07-14T06:10:00+09:00
canonical_target: origin/dev
live_context: opsia-admin
live_namespace: management
---

# AWS dev 배포 드리프트 감사

이 문서는 `deploy/management/kustomization.yaml` 렌더와 AWS EKS `kubernetes-ops`의
`management` namespace를 읽기 전용으로 대조한 결과다. 비교 대상은 image, env,
replicas, resources다. 이 감사 중 제품 workload를 변경하는 명령은 실행하지 않았다.

## 결론

- Git manifest는 backend와 console을 ECR digest로 고정한다. live는 같은 시점의
  `c704729c1b` tag를 사용한다. 현재 tag가 같은 digest를 해석하더라도 tag는 재지정될 수
  있으므로 spec 드리프트다.
- live `api-gateway`에는 `DEV_AUTH_BYPASS`가 없다. manifest의 명시값 `0`을 정본으로
  유지하며 live 값이 없거나 `0`이 아니면 배포 전 검증에서 거부한다.
- manifest에 `auto-revert-worker`, `change-correlation-worker`가 있지만 live에는 없다.
  반대로 live `cluster-agent`는 kustomization에 없다. 첫 배포 rollback plan이 이 차이를
  안전하게 다룰 때까지 workload 적용을 금지한다.
- 비교 가능한 workload의 replicas와 resources는 모두 일치한다.
- 일부 live worker에 `OUTBOX_RELAY_BATCH=10`이 수동으로 남아 있다. 코드 기본값도 10이고
  실제 relay가 아닌 worker에는 불필요하므로 manifest로 복제하지 않는다.

## 이미지 표기

| 약어 | 값 |
|---|---|
| `S-tag` | `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubernetes-ops-service:c704729c1b` |
| `S-digest` | `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubernetes-ops-service@sha256:132cbc945004812ae3367c21a3408da8f3c9ab1a01b5870ffdea1157c83f5d0a` |
| `C-tag` | `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubernetes-ops-console:c704729c1b` |
| `C-digest` | `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubernetes-ops-console@sha256:8c49f7bf8a10f5b9edb8de798cbe94d78ca29d03699bc2f3686c1636ec397978` |

## workload 전수 대조

`동일`은 image, env, replicas, resources가 모두 일치한다. `env 동일`은 env 차이가
없다는 뜻이며 secret 원문은 감사 결과에 포함하지 않는다.

| workload | image | env | replicas | resources | 판정 |
|---|---|---|---:|---|---|
| agent-api-proxy | 동일 | 동일 | 2 | 동일 | 일치 |
| ai-chat-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| ai-diff-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| ai-fallback-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| alert-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| analyze-worker | `S-tag` → `S-digest` | live-only `OUTBOX_RELAY_BATCH=10` | 1 | 동일 | 불필요 env 제거 유지 |
| api-gateway | `S-tag` → `S-digest` | manifest-only `DEV_AUTH_BYPASS=0` | 2 | 동일 | 보안 정본 0 채택 |
| approval-worker | `S-tag` → `S-digest` | live-only `OUTBOX_RELAY_BATCH=10` | 1 | 동일 | 불필요 env 제거 유지 |
| audit-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| auto-revert-worker | live에 없음 | manifest 기준 | 1 | 해당 없음 | 첫 배포 차단 항목 |
| backlog-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| change-correlation-worker | live에 없음 | manifest 기준 | 1 | 해당 없음 | 첫 배포 차단 항목 |
| cloudflared | 동일 | 동일 | 2 | 동일 | 일치 |
| cluster-agent | live-only service digest `4618…cbc2` | live 권위 runtime env | 1 | live는 미지정 | 별도 reconciliation 필요 |
| command-janitor | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| command-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| console | `C-tag` → `C-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| console-dev | `C-tag` → `C-digest` | 동일 | 2 | 동일 | manifest digest 채택 |
| dashboard-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| dead-letter-monitor | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| diff-analyze-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| diff-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| dispatch-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| drift-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| evidence-worker | `S-tag` → `S-digest` | live-only `OUTBOX_RELAY_BATCH=10` | 1 | 동일 | 불필요 env 제거 유지 |
| git-pull-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| github-poll-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| incident-worker | `S-tag` → `S-digest` | live-only `OUTBOX_RELAY_BATCH=10` | 1 | 동일 | 불필요 env 제거 유지 |
| mail-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| manifest-render-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| minio | 동일 | 동일 | 1 | 동일 | 일치 |
| nats | 동일 | 동일 | 1 | 동일 | 일치 |
| outbox-relay | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| pgbouncer | 동일 | 동일 | 1 | 동일 | 일치 |
| plan-worker | `S-tag` → `S-digest` | live-only `OUTBOX_RELAY_BATCH=10` | 1 | 동일 | 불필요 env 제거 유지 |
| postgresql | 동일 | 동일 | 1 | 동일 | 일치 |
| rca-feedback-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| rca-timeline-janitor | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| rca-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| realtime-gateway | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| recovery-worker | `S-tag` → `S-digest` | live-only `OUTBOX_RELAY_BATCH=10` | 1 | 동일 | 불필요 env 제거 유지 |
| redis | 동일 | 동일 | 1 | 동일 | 일치 |
| release-flow-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| rollout-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| safe-pr-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| scm-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| select-worker | `S-tag` → `S-digest` | live-only `OUTBOX_RELAY_BATCH=10` | 1 | 동일 | 불필요 env 제거 유지 |
| target-reconcile-worker | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |
| workflow-controller | `S-tag` → `S-digest` | 동일 | 1 | 동일 | manifest digest 채택 |

## manifest 밖 파일과 일회성 workload

- `deploy/management/target-agent.yaml`은 kustomization에 포함하지 않는다. live
  `cluster-agent`는 registry 권위 설정과 과거 digest로 동작하며, 해당 파일은 container 이름과
  인증 env 의미가 달라 동일 workload로 간주할 수 없다.
- `deploy/management/migration-job.yaml`은 배포 workflow가 image를 새 digest로 바꿔 실행하는
  일회성 Job이다. 상시 live workload와 비교하지 않는다.
- `deploy/management/storage.yaml`의 초기화 Job은 설치 bootstrap용이며 이미 완료된 live
  Deployment/StatefulSet 집합과 별도로 본다.

## 첫 배포 해제 조건

1. PostgreSQL과 NATS EBS snapshot이 모두 `completed`, 암호화, live volume 일치, 24시간 이내,
   source SHA 일치, restore rehearsal 통과 tag를 만족한다.
2. live DB schema를 revision history와 대조하고 정합성 검사를 통과한 경우에만 baseline한다.
3. `auto-revert-worker`, `change-correlation-worker` 신규 생성과 live-only `cluster-agent` 보존을
   rollback plan이 명시적으로 처리한다. 현재 digest capture는 live에 없는 desired workload를
   거부하므로 이 조건을 충족하기 전 첫 배포는 fail-closed다.
4. 렌더와 live의 `DEV_AUTH_BYPASS=0`, Dev Gate 성공 SHA, immutable service/console digest를
   확인한다.
5. 첫 배포는 `workflow_dispatch`와 `FIRST_DEPLOY` 확인값으로 한 번만 수행한다. 성공 후에만
   Environment 변수 `AWS_DEV_DEPLOY_ENABLED=1`을 설정한다.
