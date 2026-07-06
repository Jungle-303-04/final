# 외부 콘솔 인스턴스 런북

이 화면은 Kubernetes 클러스터 목록이 아니라 외부 콘솔이 호스팅하는 **Console 인스턴스** 목록이다.

현재 화면 기준:

| 인스턴스 | 호스팅 | 제공자 | 지역 | 소유자 |
| --- | --- | --- | --- | --- |
| 클러스터01 | shared | AWS | us-east-1 | cluster01-cloud-sa |
| 클러스터02 | shared | AWS | us-east-1 | cluster02-cloud-sa |

각 인스턴스 안으로 들어가면 그 Console에서 다시 CD clusters, services, repositories, providers를 관리한다.

## 환경 파일

```bash
cp config/env/external-console-instances.env.example .env.external-console-instances
```

각 인스턴스의 **콘솔로 이동** 버튼을 눌러 열린 Console URL과 access token을 넣는다.

```bash
EXTERNAL_CONSOLE_CLI=
EXTERNAL_CONSOLE_CLUSTER01_CONSOLE_URL=
EXTERNAL_CONSOLE_CLUSTER01_CONSOLE_TOKEN=
EXTERNAL_CONSOLE_CLUSTER01_CLUSTER_HANDLES=

EXTERNAL_CONSOLE_CLUSTER02_CONSOLE_URL=
EXTERNAL_CONSOLE_CLUSTER02_CONSOLE_TOKEN=
EXTERNAL_CONSOLE_CLUSTER02_CLUSTER_HANDLES=
```

`*_CLUSTER_HANDLES`는 인스턴스 안에 등록된 CD cluster handle이다. 콘솔 인스턴스 이름과는 별개일 수 있다.

## 인스턴스별 조회

```bash
make external-instances
```

조회 항목:

- Console CD clusters
- CD providers
- repositories
- cluster handle별 services

기본 동작은 읽기 전용이다. kubeconfig까지 갱신하려면 명시적으로 켠다.

```bash
FETCH_KUBECONFIG=true make external-instances
```

## 직접 명령

```bash
$EXTERNAL_CONSOLE_CLI deployments --url "$CONSOLE_URL" --token "$CONSOLE_TOKEN" clusters list
$EXTERNAL_CONSOLE_CLI deployments --url "$CONSOLE_URL" --token "$CONSOLE_TOKEN" providers list
$EXTERNAL_CONSOLE_CLI deployments --url "$CONSOLE_URL" --token "$CONSOLE_TOKEN" repositories list
$EXTERNAL_CONSOLE_CLI deployments --url "$CONSOLE_URL" --token "$CONSOLE_TOKEN" services list @<cluster-handle>
$EXTERNAL_CONSOLE_CLI deployments --url "$CONSOLE_URL" --token "$CONSOLE_TOKEN" clusters get-credentials @<cluster-handle>
```

`kubectl`/`helm`로 실제 Kubernetes를 보는 단계는 kubeconfig가 잡힌 뒤에 한다.

```bash
make cluster-interactions
```
