# 외부 GitOps controller + 기준 원본 학습용 실습 환경

이 문서는 `cluster-1` EKS 클러스터에 연결해 둔 외부 GitOps controller 학습 앱과 기준 원본 Timeline/Live Traffic을 다시 실행하고 살펴보기 위한 안내서다.

## 현재 구성

| 구성 요소 | 상태 | 용도 |
| --- | --- | --- |
| 외부 GitOps controller 3.4.5 | `argocd` 네임스페이스에서 실행 중 | GitOps 동기화, Diff, History, Project, Repository 학습 |
| 공식 예제 저장소 | `https://github.com/argoproj/argocd-example-apps.git` | Plain YAML, Helm, Kustomize, Jsonnet, Hook, Sync Wave, Multi-source 예제 |
| 학습용 Application | 11개 | 10개 자동 동기화, 1개 수동 동기화 실습 |
| traffic flow collector 0.0.16 | `caretta` 네임스페이스에서 실행 중 | eBPF 기반 서비스 간 네트워크 흐름 수집 |
| 기준 원본 Timeline | SQLite 영속 저장 | Kubernetes 리소스 변경과 이벤트를 시간축으로 확인 |

## 접속

### 기준 원본

- GitOps: <http://127.0.0.1:9280/gitops>
- Live Traffic: 왼쪽 메뉴의 **Live Traffic**
- Timeline: 왼쪽 메뉴의 **Timeline**
- Helm: 왼쪽 메뉴의 **Helm**에서 `caretta` 릴리스 확인

### 외부 GitOps controller

외부 GitOps controller 서버는 클러스터 외부에 노출하지 않고 로컬 포트 포워딩으로만 연다.

```bash
kubectl --context cluster-1 -n argocd port-forward service/argocd-server 18080:80
```

브라우저에서 <http://127.0.0.1:18080>을 열고 사용자 이름 `admin`으로 로그인한다. 초기 비밀번호는 다음 명령으로 확인한다.

```bash
kubectl --context cluster-1 -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 --decode; echo
```

학습이 끝난 뒤에는 외부 GitOps controller의 **User Info > Update Password**에서 초기 비밀번호를 바꾸는 편이 좋다.

## 외부 GitOps controller 실습 앱

| 이름 | 렌더링/기능 | 살펴볼 화면 |
| --- | --- | --- |
| `01-manual-plain-yaml` | Plain YAML, 수동 동기화 | Tree의 Missing 리소스, Diff, Sync 옵션 |
| `02-auto-helm` | Helm, 자동 동기화 | Parameters, History, 자동 복구 정책 |
| `03-auto-kustomize` | Kustomize | Manifest 렌더링 결과와 리소스 트리 |
| `04-auto-jsonnet` | Jsonnet | Jsonnet이 생성한 Deployment/Service |
| `05-pre-post-hooks` | PreSync/PostSync Hook | 동기화 과정에 나타나는 Job과 Hook 상태 |
| `06-sync-waves` | Sync Wave | annotation 순서에 따른 단계별 배포 |
| `07-multi-source-helm` | Multi-source | 여러 Source를 조합한 Application 상세 |
| `08-appset-dev`, `08-appset-stage` | List Generator | ApplicationSet이 두 환경을 생성하는 과정 |
| `09-git-app-a`, `09-git-app-b` | Git Directory Generator | Git 디렉터리 발견으로 앱이 생성되는 과정 |

`01-manual-plain-yaml`은 사용자가 직접 **Diff → Sync → Synchronize**를 눌러 변화를 관찰할 수 있도록 의도적으로 `OutOfSync/Missing` 상태로 남겼다. 나머지 10개는 `Synced/Healthy` 상태다.

## 외부 GitOps controller 메뉴 읽는 법

- **Applications**: 앱 카드, 리소스 Tree, Desired/Live Manifest Diff, Sync, Refresh, Delete, 배포 History를 확인한다.
- **Settings > Repositories**: 연결된 Git/Helm 저장소와 연결 성공 여부를 확인한다.
- **Settings > Repository certificates and known hosts**: 사설 Git 서버의 TLS 인증서와 SSH known hosts를 관리한다.
- **Settings > GnuPG keys**: 서명된 Git 커밋 검증에 사용할 키를 관리한다.
- **Settings > Clusters**: 외부 GitOps controller가 배포할 수 있는 대상 클러스터를 확인한다.
- **Settings > Projects**: 허용 저장소, 대상 네임스페이스, 리소스 범위, Sync Window, 역할을 제한한다. 이 실습은 `learning-lab` 프로젝트를 사용한다.
- **Settings > Accounts**: 로컬 계정과 권한을 확인한다.
- **Settings > Appearance**: 테마와 표시 설정을 변경한다.
- **User Info**: 현재 계정, 토큰, 비밀번호를 관리한다.

## 기준 원본 메뉴 읽는 법

- **Home**: 클러스터 상태와 주요 요약 지표를 본다.
- **Resources**: Kubernetes 원본 리소스를 종류/네임스페이스별로 탐색한다.
- **Issues**: 준비 실패, 재시작, 비정상 상태 등 문제 후보를 모아 본다.
- **Topology**: 리소스 소유 관계와 연결 구조를 그래프로 본다.
- **Applications**: Deployment, StatefulSet 등 애플리케이션 단위로 묶어 본다.
- **Timeline**: 생성·변경·삭제·상태 이벤트를 시간 순서로 추적한다.
- **Live Traffic**: traffic flow collector가 관측한 서비스 간 네트워크 흐름을 그래프와 표로 본다.
- **Helm**: 설치된 릴리스, 차트 버전, revision과 상태를 확인한다.
- **GitOps**: 외부 GitOps 애플리케이션의 Sync와 Health 상태를 한곳에서 본다.
- **Checks**: 클러스터 진단 규칙의 결과를 확인한다.
- **Cost**: OpenCost가 연결된 경우 네임스페이스/워크로드 비용을 확인한다.
- **Settings**: kube-context, Timeline 저장소, Prometheus 등 연결 설정을 확인한다.

## Timeline 화면

Timeline은 “어떤 리소스가 언제 어떤 상태로 바뀌었는가”를 추적하는 화면이다.

- 상단 시간 범위에서 최근 1시간 등 조회 구간을 바꾼다.
- **Group by app**은 관련 리소스를 애플리케이션 단위로 묶는다.
- **Deleted**는 이미 삭제된 Job/Pod 같은 리소스도 포함한다.
- Timeline 보기는 변화 시점을 시간축으로, List 보기는 이벤트를 행 단위로 보여준다.
- 색상과 아이콘으로 생성, 변경, 삭제, Warning/Normal 이벤트를 구분한다.
- 현재 구성은 `/Users/woonyong/.reference/kubeheal-timeline.db`에 최대 1GiB SQLite 데이터로 기록한다.

설치 직후 검증 시점에는 최근 1시간에 134개 리소스와 2,545개 이벤트가 표시됐다. 이 수치는 클러스터 활동에 따라 계속 변한다. traffic flow collector DaemonSet 교체, 외부 GitOps Application/ApplicationSet 생성, Hook Job 실행 순서를 이 화면에서 확인할 수 있다.

## Live Traffic 화면

Live Traffic은 traffic flow collector의 eBPF 관측 결과를 Prometheus에서 읽어 서비스 간 흐름으로 시각화한다.

- 그래프의 노드는 워크로드/서비스, 선은 관측된 연결을 뜻한다.
- 네임스페이스 필터와 색상으로 원하는 영역만 남길 수 있다.
- 시간 범위와 최소 트래픽 임계값으로 잡음을 줄인다.
- system/external 트래픽 숨김, 인터넷 노드 접기, 포트 식별 옵션으로 그래프 밀도를 조절한다.
- 아래 Flow 표에서 source, destination, namespace, port와 트래픽을 행 단위로 확인한다.

검증 시점에는 traffic flow collector 원본 흐름 180개가 수집됐고 기준 원본에서 107개 흐름으로 집계됐다. 이 값도 실시간 트래픽에 따라 달라진다.

traffic flow collector Pod에는 다음 scrape annotation을 적용해 기존 `target/prometheus`가 `:7117/metrics`를 수집하도록 연결했다.

```yaml
prometheus.io/scrape: "true"
prometheus.io/port: "7117"
prometheus.io/path: /metrics
```

초기 기본 메모리 한도 300MiB에서는 클러스터 인벤토리 수집 중 OOM 재시작이 한 번 발생해, 학습 환경 값은 768MiB로 조정했다. 현재 두 노드의 traffic flow collector agent가 모두 Ready이고 재시작 없이 동작한다.

## 다시 적용하기

외부 GitOps controller 설치와 학습 앱 적용:

```bash
kubectl --context cluster-1 create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
kubectl --context cluster-1 apply -n argocd --server-side --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl --context cluster-1 apply -f deploy/oss/argocd-learning-lab.yaml
```

traffic flow collector 설치:

```bash
helm repo add groundcover https://helm.groundcover.com/
helm repo update groundcover
helm upgrade --install caretta groundcover/caretta \
  --version 0.0.16 \
  --namespace caretta \
  --create-namespace \
  --kube-context cluster-1 \
  --values deploy/oss/caretta-values.yaml \
  --rollback-on-failure \
  --wait \
  --timeout 10m
```

## 상태 확인

```bash
kubectl --context cluster-1 -n argocd get applications.argoproj.io \
  -o custom-columns='NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status,PHASE:.status.operationState.phase'

kubectl --context cluster-1 -n caretta get pods -o wide

helm --kube-context cluster-1 -n caretta status caretta

curl -s http://127.0.0.1:9280/api/traffic/flows | \
  jq '{source, flow_count:(.flows | length), aggregated_count:(.aggregated | length)}'
```

## 제거

학습 앱만 제거하려면 다음을 실행한다.

```bash
kubectl --context cluster-1 delete -f deploy/oss/argocd-learning-lab.yaml
```

traffic flow collector를 제거하려면 다음을 실행한다.

```bash
helm --kube-context cluster-1 -n caretta uninstall caretta
kubectl --context cluster-1 delete namespace caretta
```

외부 GitOps controller 자체까지 제거하는 아래 명령은 해당 controller와 네임스페이스의 모든 설정을 삭제한다.

```bash
kubectl --context cluster-1 delete namespace argocd
```
