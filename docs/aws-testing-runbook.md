# AWS 테스트 실행 기준

실제 서비스 통합 기준은 AWS EKS의 management/target 클러스터다. live 제품 배포의 유일한
진입점은 `.github/workflows/dev-deploy.yml`이다. 이 workflow는 Dev Gate 성공 SHA만 받아
최신 원본·UI delta·feature-ledger 구조를 다시 검증하고, service와 console을 같은 SHA의
immutable digest로 배포한 뒤 `scripts/smoke.sh`를 실행한다.

증분 Dev 패치는 `make release-governance-web-patch`를 통과해야 한다. 이 게이트는 미완료
동등성 행을 완료로 바꾸지 않으며, frozen source 무결성·최신 UI delta 전수 분류·기능 계약
구조를 검증한다. 최종 Python/React 동등성 인증은 별도의
`make release-governance-web`이 모든 baseline 행을 완료로 판정할 때만 통과한다.

이 변경은 제품 내부 자동화를 제거한다는 뜻이 아니다. `workflow-controller`와 GitOps 이벤트
체인은 계속 배포 정의, 승인, 적용, 롤아웃을 자동으로 처리한다. 여기서 없앤 것은 저장소 밖의
CI runner가 배포를 대신 시작하던 진입점뿐이다.

## 검증 단계

| 상황 | 실행 | 확인 범위 |
| --- | --- | --- |
| 코드 정합성 | `make test` | lint, import boundary, compile, pytest |
| Kubernetes manifest | `make manifest-check` | management/target 렌더와 client dry-run |
| 커밋 전 기본 게이트 | `make check` | 코드 정합성과 manifest |
| 기존 AWS 환경 smoke | `make smoke` | health, 로그인, webhook, 내부 workflow, target 명령 |
| AWS 앱 재배포 | `Dev Deploy` workflow | image build, migration, digest rollout, 필수 smoke |

## 기존 AWS 환경에서 smoke

아래 값은 셸 환경이나 gitignore된 로컬 환경 파일에서 주입한다. 비밀번호와 토큰은 명령행
인자나 문서에 넣지 않는다.

```bash
export BASE_URL="https://k8s.woonyong.org"
export AUTH_EMAIL="<admin email>"
export AUTH_PASSWORD="<admin password>"
export SMOKE_CLUSTER_ID="<connected target cluster id>"
export MGMT_CONTEXT="<management kubeconfig context>"
make smoke
```

`SMOKE_CLUSTER_ID`는 연결된 첫 번째 target을 가리켜야 한다. `scripts/smoke.sh`는 gateway
health를 확인하고 로그인한 뒤, 서명된 webhook을 직접 보내 내부 GitOps workflow가
`git.changed -> manifest.rendered -> desired.diff.detected -> diff.analyzed`로 이어지는지
검증한다. body의 `force: true`는 이미 같은 SHA가 처리됐어도 smoke에서 한 번 더 검증하기
위한 값이다.

LoadBalancer DNS가 늦게 전파될 수 있으므로 `SMOKE_GATEWAY_ATTEMPTS` 기본값은 60,
간격은 5초다. rollout 직후 로그인 연결이 잠깐 끊길 수 있어 `AUTH_LOGIN_ATTEMPTS` 기본값은
12다. 재시도 횟수를 늘리기 전에 pod Ready, ingress와 DNS를 먼저 확인한다.

## 로컬 인프라 bootstrap

`scripts/aws-up.sh`는 새 sandbox 인프라 bootstrap과 복구 도구다. 기존 live
`kubernetes-ops` workload의 제품 release에는 실행하지 않는다. live 배포는 `Dev Deploy`
workflow만 사용한다.

```bash
export AWS_REGION="<region>"
export AWS_PROFILE="<profile>"
export MGMT_CLUSTER="<management cluster>"
export TARGET_CLUSTER_1="<target cluster 1>"
export TARGET_CLUSTER_2="<target cluster 2>"
export MANIFEST_PATH="<repository manifest path>"
export CREATE_CLUSTERS=0
export ENSURE_EBS_CSI=0
export BOOTSTRAP_ADMIN=0
export REGISTER_TARGETS=0
export RUN_SMOKE=1
bash scripts/aws-up.sh
```

`MANIFEST_PATH`는 운영 배포에서 필수다. smoke 전용으로만 실행할 때는
`SMOKE_MANIFEST_PATH=src/samples/smoke/deploy.yaml`을 쓸 수 있다. target agent 설치용
`deploy/target/target.yaml`은 애플리케이션 GitOps 입력으로 사용하지 않는다.

주요 이미지 환경값은 서비스용 `ECR_REPO`와 콘솔용 `CONSOLE_ECR_REPO`다. 배포 스크립트는
두 이미지를 ECR에 push하고 immutable tag를 management kustomization에 반영한다.

## 일시적인 EKS API 오류

`TLS handshake timeout`은 EKS control plane이 죽었다는 뜻이 아니라 `kubectl rollout status`
조회가 일시적으로 실패한 경우가 많다. `scripts/aws-up.sh`는 rollout 대상 조회와 각 상태 확인을
3번 재시도한다. 모두 실패하면 해당 리소스의 `get -o wide`와 `describe`를 남기므로 네트워크
오류와 실제 pod 실패를 구분한다.

## Cloudflare와 서비스 URL

EKS가 Active여도 서비스 URL이 즉시 열리는 것은 아니다. 아래 순서가 모두 끝나야 한다.

1. management manifest가 적용된다.
2. console, api-gateway, worker, NATS, PostgreSQL이 Ready가 된다.
3. console Service에 AWS LoadBalancer hostname이 생긴다.
4. Cloudflare CNAME이 LoadBalancer를 origin으로 가리킨다.
5. `/api/healthz`가 `200`과 api-gateway 응답을 반환한다.

Cloudflare를 사용할 때 `CUSTOM_DOMAIN`, `CLOUDFLARE_ZONE_NAME`,
`CLOUDFLARE_API_TOKEN`을 환경에서 주입하고 `CONFIGURE_CLOUDFLARE=1`로 실행한다.
`CLOUDFLARE_PROXIED` 기본값은 `1`이다. token 원문은 로그에 출력하지 않으며, DNS 변경이
실패해도 AWS LoadBalancer origin으로 상태를 확인할 수 있어야 한다.

브라우저 콘솔과 cluster-agent는 진입점을 분리한다. 무료 Cloudflare Bot Fight는 기계 요청에
관리형 챌린지를 줄 수 있으므로 agent가 proxied console 주소를 사용하면 안 된다.
`scripts/configure-agent-api-endpoint.sh`는 ACM 인증서를 붙인 AWS LoadBalancer와 DNS-only
CNAME을 만들고, `/api/agent/*`, `/api/install/*`, `/api/healthz`와 agent WebSocket
`/live/agent`만 허용하는 전용 proxy를 배포한다. ELB는 TLS를 종료한 뒤 backend TCP 전달을
사용해 WebSocket Upgrade를 보존한다. 브라우저 경로 `/live/browser`와 일반 관리 API는
404로 닫는다. ACM ARN과 도메인, Cloudflare 자격증명은 모두 환경에서 주입하며 소스에
저장하지 않는다.

```bash
export KUBE_CONTEXT="<management context>"
export AGENT_API_DOMAIN="<agent api hostname>"
export AGENT_API_ACM_CERT_ARN="<issued ACM certificate ARN>"
export CLOUDFLARE_ZONE_ID="<zone id>"
export CLOUDFLARE_API_TOKEN="<DNS edit token>"
bash scripts/configure-agent-api-endpoint.sh
```

스크립트는 `management-runtime-config.PUBLIC_MANAGEMENT_BASE_URL`을 전용 주소로 바꾸고
api-gateway를 재시작한다. 따라서 이후 등록 manifest는 Bot Fight 경로를 거치지 않는다.
이미 설치된 agent는 새 주소로 manifest를 재발급하거나 Deployment의
`MANAGEMENT_BASE_URL`을 갱신해야 한다.

```bash
curl -fsS https://k8s.woonyong.org/api/healthz
```

정상 응답 예시는 다음과 같다.

```json
{"status":"ok","service":"api-gateway"}
```

## 실제 리소스 변경 E2E

`scripts/e2e_test.py`는 기존 AWS 배포와 target agent 연결이 끝난 뒤에만 수동 실행한다.
target의 `sandbox` namespace에 테스트 Deployment를 만들고 restart/scale이 agent를 거쳐
실제 Kubernetes API에 반영되는지 확인한 뒤 정리한다.

```bash
export BASE_URL="https://k8s.woonyong.org"
export AUTH_EMAIL="<admin email>"
export AUTH_PASSWORD="<admin password>"
export SMOKE_CLUSTER_ID="<target cluster id>"
export MGMT_CONTEXT="<management context>"
export TARGET_CONTEXT="<target context>"
uv run python scripts/e2e_test.py
```

## 통과 기준

1. `make check`가 통과한다.
2. management namespace의 gateway와 모든 worker가 Ready다.
3. target agent가 connected이고 evidence를 보낸다.
4. `make smoke`가 내부 workflow의 manifest/diff 이벤트까지 확인한다.
5. outbox backlog와 신규 DLQ가 남지 않는다.
6. 실제 변경 E2E 후 target 리소스와 명령 상태가 일치한다.

자동화된 제품 workflow의 성공 여부는 GitHub Actions 화면이 아니라 내부 audit/timeline,
worker 로그, outbox와 target 상태를 함께 확인해 판단한다.
