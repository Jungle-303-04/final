# 라이브 데모 런북

목표 흐름: 클러스터 연결 -> 레포 연결 -> 자동 배포 -> 장애 -> RCA/복구 제안 -> 승인 -> 자동 복구.

## 사전 준비

- 콘솔: `https://k8s.woonyong.org`
- management context: `mgmt`
- target context: `game-server`
- 데모 레포: `Jungle-303-04/k8s-incident-demo-target`
- 브랜치: `main`
- manifest path: `deploy/k8s`
- source type: `kustomize`
- namespace: `sandbox`
- 데모 앱 URL: 콘솔의 game-server 서비스 인벤토리에서 `storefront-web` external hostname을 연다. 발표용 별칭이 준비되어 있으면 `https://target-01.woonyong.org/?demo=true`를 사용한다.

본 발표 전에는 최초 adoption approval을 리허설에서 1회 처리해 둔다. `GITOPS_REQUIRE_APPROVED_SNAPSHOT=1`이므로 완전 초기 DB에서는 첫 배포가 승인 대기 상태가 될 수 있다. 발표 중에는 이 승인을 보여주지 않고, 장애 복구 승인 장면에 집중한다.

## 리셋

시작 상태를 만들 때:

```bash
source .env.local-test
BASE_URL=https://k8s.woonyong.org/api \
WEB_BASE_URL=https://k8s.woonyong.org \
TARGET_CONTEXT=game-server \
CLUSTER_ID=game-server \
bash scripts/demo-reset.sh --uninstall-agent
```

상태만 확인할 때:

```bash
source .env.local-test
BASE_URL=https://k8s.woonyong.org/api \
TARGET_CONTEXT=game-server \
CLUSTER_ID=game-server \
bash scripts/demo-reset.sh --check-only
```

성공 기준:

- `game-server: not registered` 또는 콘솔에서 미연결 상태
- `sandbox`에 `orders-api`, `storefront-web`, `demo-target-config` 없음
- `target`에 `deploy/cluster-agent`, `target-runtime-config`, `target-runtime-secret` 없음

## 1. 클러스터 연결

콘솔 경로:

1. `Clusters` -> `Register cluster`
2. Provider: `EKS`
3. 이름: `game-server`
4. region: `ap-northeast-2`
5. EKS cluster name: `game-server`
6. context alias: `game-server`
7. 생성된 설치 명령을 복사해 터미널에서 실행

설치 명령 형태:

```bash
aws eks update-kubeconfig \
  --region ap-northeast-2 \
  --name game-server \
  --alias game-server

kubectl config use-context game-server
kubectl get nodes

curl -fsSL https://k8s.woonyong.org/api/install/<agent_token> | kubectl apply -f -
kubectl --context game-server -n target rollout status deploy/cluster-agent --timeout=180s
```

예상 대기시간:

- kubeconfig 갱신/노드 확인: 5-15초
- cluster-agent rollout: 20-60초
- 콘솔 `연결됨` 전환: evidence 주기 기준 약 8-20초

플랜B:

- `rollout status`가 멈추면 `kubectl --context game-server -n target logs deploy/cluster-agent --tail=80` 확인
- 콘솔 전환이 늦으면 `https://k8s.woonyong.org/api/healthz` 200 확인 후 evidence-worker 로그 확인

## 2. 레포 연결과 자동 배포

콘솔 경로:

1. `Repositories` 또는 game-server 상세의 `Connect repository`
2. repo: `Jungle-303-04/k8s-incident-demo-target`
3. branch: `main`
4. manifest path: `deploy/k8s`
5. source type: `kustomize`
6. cluster: `game-server`
7. namespace: `sandbox`
8. `Connect` 후 run 상태 확인

성공 기준:

```bash
kubectl --context game-server -n sandbox rollout status deploy/orders-api --timeout=180s
kubectl --context game-server -n sandbox rollout status deploy/storefront-web --timeout=180s
kubectl --context game-server -n sandbox get svc storefront-web
```

콘솔에서 `storefront-web` 서비스의 external hostname이 클릭 가능한 링크로 보여야 한다.
2026-07-08 실측 기준 inventory API도 `summary.external_url`에 storefront LoadBalancer URL을 노출한다.

예상 대기시간:

- repo validation: 2-5초
- GitHub poll/render/diff/apply: 20-90초
- LoadBalancer hostname 할당: 1-3분

플랜B:

- run이 `waiting_for_approval`이면 adoption approval을 승인하고 계속 진행한다.
- LoadBalancer가 늦으면 `kubectl --context game-server -n sandbox port-forward svc/storefront-web 8080:80`로 로컬 확인을 먼저 보여준다.

## 3. 장애 유발

쇼핑몰 URL에 `?demo=true`를 붙여 Scenario Console을 연다.

권장 시나리오:

- Crash: 빠르게 감지되고 복구 제안이 안정적으로 뜬다.
- Memory pressure: 메트릭 전후 비교에 적합하다.

예상 대기시간:

- 장애 버튼 클릭 후 Pod 상태 변화: 5-20초
- incident 감지/RCA 후보 생성: 30-90초
- recovery plan 표시: 30-120초

플랜B:

```bash
TARGET_CONTEXT=game-server bash scripts/scenario-inject.sh inject crashloop
```

정리:

```bash
TARGET_CONTEXT=game-server bash scripts/scenario-inject.sh cleanup crashloop
```

## 4. 제안 승인과 자동 복구

콘솔 경로:

1. incident 상세 진입
2. RCA root cause와 evidence trail 확인
3. Recovery proposal에서 `restart` 또는 `scale` 액션 확인
4. `Approve` 클릭
5. command/recovery 상태가 진행 중 -> 완료로 바뀌는지 확인

검증 명령:

```bash
kubectl --context game-server -n sandbox get deploy orders-api storefront-web
kubectl --context game-server -n sandbox get pods -o wide
```

성공 기준:

- `restart`면 affected deployment의 Pod age가 새로 갱신된다.
- `scale`이면 replica 수가 증가한다.
- incident 상태가 resolved/closed로 전환된다.
- 메트릭 패널에서 장애 전후 변화가 보인다.

## 리허설 기록

| 회차 | 리셋 | 연결 | 배포 | 장애 감지 | 복구 승인 | 총 소요 | 결과 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 기존 연결 유지 | 기존 연결 유지 | 76초(webhook -> 5개 command 완료) | 미실행 | 미실행 | 76초 | 성공: Service 2개, ConfigMap 1개, Deployment 2개가 리소스별 approval/command로 모두 적용됨. `https://target-01.woonyong.org/?demo=true` 200 |
| 2 | TBD | TBD | TBD | TBD | TBD | TBD | 전체 장애/RCA/복구 리허설 필요 |

## 실패 시 즉시 전환

- 클러스터 연결 실패: 이미 연결된 `demo-server` 타일로 전환해 agent evidence가 계속 들어오는 구조를 설명한다.
- 레포 배포 실패: 사전 배포된 `storefront-web` LoadBalancer URL을 열고 장애/RCA 단계로 이동한다.
- RCA 지연: 최근 생성된 game-server incident 상세로 이동해 recovery proposal 승인 장면을 진행한다.
- 복구 command 지연: `kubectl rollout restart deploy/<name>` 또는 `kubectl scale deploy/<name> --replicas=2`를 수동 실행하고, 플랫폼 승인 액션과 동일한 효과임을 설명한다.
