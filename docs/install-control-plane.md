# 설치 제어면 준비도

이 문서는 웹앱에서 "클러스터 연결", "관리 구성 설치", "타깃 앱 설치" 버튼을 만들 때
현재 백엔드가 어디까지 준비되어 있는지 정리한다.

## 목표 흐름

1. 사용자가 웹앱에서 클러스터 정보를 입력한다.
2. API가 설치 계획과 Kubernetes manifest preview를 만든다.
3. 사용자가 확인하면 API가 허용된 kube context 또는 agent 경로로 설치를 적용한다.
4. 설치 뒤 target agent가 management plane에 등록되고, 정책/desired-state/schedule을 동기화한다.
5. UI는 registration, policy, reconcile, evidence, command 상태를 timeline으로 보여준다.

## 현재 준비된 경계

| 영역 | 현재 상태 |
| --- | --- |
| Target 등록 API | `POST /targets`가 target cluster 등록, agent token 발급, install manifest 반환, 선택적 apply를 수행한다. |
| Manifest renderer | `domains.target.install_manifest`로 분리되어 router 밖에서 재사용 가능하다. |
| Apply 안전장치 | `KUBE_CONTEXT_ALLOWLIST`가 없으면 명시 kube context apply를 거부한다. |
| Agent 인증 | cluster별 agent token hash를 저장하고 agent API는 token identity 기준으로 동작한다. |
| Desired state | target 등록 시 cluster-agent/node-collector desired state를 저장하고 reconcile event를 발행한다. |
| GitOps source | commit/ref 기반 remote source와 checkout cache를 지원한다. local fallback은 설정으로 통제한다. |
| Secret | `env:`와 `aws-sm:` ref가 `SecretVaultPort`/`TokenVaultPort` adapter 뒤에서 동작한다. |

## 프론트 버튼과 API 매핑

| UI 버튼 | 백엔드 동작 |
| --- | --- |
| 설치 미리보기 | `POST /targets` with `apply=false`; manifest와 agent token을 보여준다. |
| 바로 설치 | `POST /targets` with `apply=true`; `KUBE_CONTEXT_ALLOWLIST`에 있는 context만 허용한다. |
| 정책 갱신 | `PUT /clusters/{cluster_id}/policy`; 기존 정책과 부분 merge한다. |
| agent reconcile 확인 | agent status/reconcile endpoint와 dashboard projection을 연결한다. |
| GitOps 앱 연결 | repository/watch target/deployment binding 등록 후 Git webhook 또는 poller가 흐름을 시작한다. |

## 클라우드 선택성

AWS는 하나의 배포 adapter일 뿐이다. 현재 런타임은 Kubernetes API, env/Kubernetes Secret,
GitHub API, PostgreSQL, NATS, Redis를 기준으로 동작한다. AWS 전용 부분은 `scripts/aws-up.sh`,
`.github/workflows/aws-cd.yml`, `aws-sm:` SecretVault adapter에만 국한된다.

다른 설치 대상은 아래 adapter를 추가하면 된다.

| 대상 | 필요한 adapter |
| --- | --- |
| 로컬/kind | 기존 `scripts/up.sh`, kube context allowlist |
| AWS EKS | 기존 `scripts/aws-up.sh`, GitHub OIDC, ECR |
| GKE/AKS | cloud credentials, image registry, kube context/bootstrap script |
| 사내 Kubernetes | registry credential, kubeconfig upload 또는 agent bootstrap |

## 남은 작업

- Helm chart 또는 Kustomize package를 실제 파일 artifact로 생성하는 renderer adapter.
- 웹앱의 설치 preview/confirm 화면.
- kubeconfig를 직접 업로드하지 않는 agent-first bootstrap 방식.
- approval/token rotation의 만료 검증과 감사 기록 강화.
- dashboard projection에서 install/reconcile/command 상태를 한 화면으로 묶기.
