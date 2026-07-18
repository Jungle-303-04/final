# 외부 콘솔 클러스터 인터랙션 런북

이 문서는 외부 콘솔에 등록된 클러스터 2개를 로컬 CLI에서 관찰하고, repo의 management/target 운영 스크립트와 연결하는 기준이다.

## 현재 전제

- 로컬에는 외부 콘솔 CLI, `kubectl`, `helm`이 설치되어 있다.
- kubeconfig에는 `game-server`, `demo-server`, `management-server` 같은 EKS context가 이미 존재한다.
- 현재 AWS 세션은 만료될 수 있다. `kubectl`이 `Your session has expired`를 출력하면 먼저 `aws login`으로 재인증한다.
- 현재 외부 콘솔 CLI 설정은 예전 tenant URL을 볼 수 있다. `lookup ... no such host`가 나오면 새 Console URL/token으로 다시 로그인해야 한다.

## 1. 환경 파일

로컬 전용 파일은 `.env.external-console`을 사용한다. 실제 token은 git에 넣지 않는다.

```bash
cp config/env/external-console.env.example .env.external-console
```

주요 값:

```bash
EXTERNAL_CONSOLE_CLI=
EXTERNAL_CONSOLE_URL=
EXTERNAL_CONSOLE_TOKEN=
EXTERNAL_CLUSTER_HANDLES="game-server demo-server"
CLUSTER_CONTEXTS="management-server game-server demo-server"

# 기존 management/target 스크립트까지 연결할 때만 지정
MGMT_CONTEXT=
TARGET_CONTEXT=
```

`EXTERNAL_CLUSTER_HANDLES`는 외부 콘솔 UI/CLI에서 보이는 cluster handle이고, `CLUSTER_CONTEXTS`는 `kubectl config get-contexts`에 있는 local context 이름이다. 이름이 같을 수도 있고 다를 수도 있다.

## 2. kubeconfig 동기화

외부 콘솔 token이 있으면 CLI 로그인 후 클러스터 kubeconfig를 가져온다.

```bash
make external-kubeconfig
```

내부에서 실행되는 핵심 명령:

```bash
$EXTERNAL_CONSOLE_CLI deployments login --url "$EXTERNAL_CONSOLE_URL" --token "$EXTERNAL_CONSOLE_TOKEN"
$EXTERNAL_CONSOLE_CLI deployments clusters get-credentials @<cluster-handle>
kubectl config get-contexts
```

외부 콘솔 token 없이 이미 kubeconfig가 있으면 `CLUSTER_CONTEXTS` 검증만 수행한다.

## 3. 읽기 전용 인터랙션 보기

두 클러스터의 Kubernetes/Helm 상태를 한 번에 본다.

```bash
make cluster-interactions
```

확인하는 항목:

- 외부 콘솔 cluster/service 목록
- Kubernetes nodes, namespaces
- deployments, statefulsets, daemonsets
- pods, services, ingress
- Helm releases
- `management`, `target`, `sandbox`, `default`, `kube-system` 최근 events

이 스크립트는 읽기 전용이다. 리소스를 생성, 삭제, 스케일하지 않는다.

## 4. 기존 운영 명령 연결

한 클러스터를 management, 다른 클러스터를 target으로 정하면 기존 스크립트를 그대로 사용할 수 있다.

```bash
MGMT_CONTEXT=management-server TARGET_CONTEXT=game-server make status
TARGET_CONTEXT=game-server make install-telemetry
MGMT_CONTEXT=management-server make scale DEPLOYMENT=rca-worker REPLICAS=2
MGMT_CONTEXT=management-server make kill-pod DEPLOYMENT=rca-worker
```

`install-telemetry`, `scale`, `kill-pod`, `register-target.sh`는 실제 클러스터를 변경한다. 실행 전 context를 반드시 확인한다.

## 5. 외부 콘솔 CLI 직접 명령

```bash
$EXTERNAL_CONSOLE_CLI deployments clusters list
$EXTERNAL_CONSOLE_CLI deployments clusters describe @<cluster-handle>
$EXTERNAL_CONSOLE_CLI deployments services list @<cluster-handle>
$EXTERNAL_CONSOLE_CLI deployments clusters get-credentials @<cluster-handle>
```

문제가 생기면 먼저 아래 두 가지를 본다.

```bash
kubectl config get-contexts
make external-kubeconfig
```
