---
title: AWS dev 첫 배포 설정
status: operator-action-required
account: "183548421506"
region: ap-northeast-2
environment: dev-deploy
---

# AWS dev 첫 배포 설정

이 문서는 AWS와 GitHub의 사람 게이트를 복사해 실행하기 위한 런북이다. secret 값은 어느
명령의 인자, 문서, 로그에도 남기지 않는다. 제품 workload 배포는
`.github/workflows/dev-deploy.yml`만 사용한다.

## 1. 확정된 환경

```bash
export AWS_ACCOUNT_ID=183548421506
export AWS_REGION=ap-northeast-2
export AWS_PROFILE=opsia-admin
export ECR_SERVICE_REPOSITORY=kubernetes-ops-service
export ECR_CONSOLE_REPOSITORY=kubernetes-ops-console
export EKS_CLUSTER=kubernetes-ops
export BASE_URL=https://k8s.woonyong.org
export POSTGRES_VOLUME_ID=vol-064de27cf0b56d2c5
export NATS_VOLUME_ID=vol-06284f30f16497530
export POSTGRES_AZ=ap-northeast-2b
export NATS_AZ=ap-northeast-2b
```

- RDS는 사용하지 않는다. PostgreSQL과 NATS JetStream은 EKS PVC의 EBS volume에 있다.
- `kubeheal-service`, `kubeheal-console` 저장소는 사용하지 않는다.
- 관리 EKS는 `kubernetes-ops`, 연결 대상은 `cluster-1`, `cluster-2`다.
- 현재 live release SHA는 `c704729c1b16a6fd397e1c7285249f80517a01a8`다.
- 생성된 PostgreSQL snapshot `snap-0bebb31ef7c909f9c`는 상태와 tag를 아래 검증기로 다시
  확인한다. NATS snapshot도 별도로 필요하다.

```bash
aws sts get-caller-identity --profile "${AWS_PROFILE}"
aws ecr describe-repositories --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --repository-names "${ECR_SERVICE_REPOSITORY}" "${ECR_CONSOLE_REPOSITORY}"
aws eks describe-cluster --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --name "${EKS_CLUSTER}" --query 'cluster.status' --output text
```

## 2. GitHub Environment

GitHub 저장소 `Jungle-303-04/final`의 Settings → Environments에서 `dev-deploy`를 만든다.

1. Deployment branches and tags는 `Selected branches and tags`를 선택한다.
2. branch rule은 `dev`만 추가한다.
3. Required reviewers는 사용하지 않는다. 최초 수동 배포는 workflow의
   `FIRST_DEPLOY` 확인값과 이 런북의 snapshot 검증으로 제한하고, 이후 커밋별 배포가 사람
   승인 때문에 정지하지 않게 한다.
4. 배포 변수와 secret은 Repository가 아니라 `dev-deploy` Environment에만 저장한다.

workflow deploy job은 `environment: dev-deploy`를 선언한다. OIDC의 `sub`도 이 이름으로
고정되어 fork와 pull request가 역할을 assume할 수 없다.

## 3. GitHub OIDC 공급자

```bash
export GITHUB_OIDC_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

if aws iam get-open-id-connect-provider \
  --profile "${AWS_PROFILE}" \
  --open-id-connect-provider-arn "${GITHUB_OIDC_ARN}" >/dev/null 2>&1; then
  echo "GitHub OIDC provider exists"
else
  aws iam create-open-id-connect-provider \
    --profile "${AWS_PROFILE}" \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com
fi

aws iam get-open-id-connect-provider \
  --profile "${AWS_PROFILE}" \
  --open-id-connect-provider-arn "${GITHUB_OIDC_ARN}" \
  --query '{Url:Url,ClientIDList:ClientIDList}'
```

## 4. 배포 IAM 역할

### 4.1 신뢰 정책

```bash
cat >/tmp/opsia-dev-deploy-trust.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::183548421506:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:Jungle-303-04/final:environment:dev-deploy"
        }
      }
    }
  ]
}
JSON

export DEPLOY_ROLE_NAME=opsia-dev-deploy
if aws iam get-role --profile "${AWS_PROFILE}" --role-name "${DEPLOY_ROLE_NAME}" >/dev/null 2>&1; then
  aws iam update-assume-role-policy \
    --profile "${AWS_PROFILE}" \
    --role-name "${DEPLOY_ROLE_NAME}" \
    --policy-document file:///tmp/opsia-dev-deploy-trust.json
else
  aws iam create-role \
    --profile "${AWS_PROFILE}" \
    --role-name "${DEPLOY_ROLE_NAME}" \
    --assume-role-policy-document file:///tmp/opsia-dev-deploy-trust.json
fi
```

`StringLike`와 wildcard는 사용하지 않는다. 허용된 subject는
`repo:Jungle-303-04/final:environment:dev-deploy` 하나다.

### 4.2 최소 AWS 권한

```bash
cat >/tmp/opsia-dev-deploy-permissions.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrAuthorization",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "PushOnlyOpsiaRepositories",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:CompleteLayerUpload",
        "ecr:DescribeImages",
        "ecr:DescribeRepositories",
        "ecr:GetDownloadUrlForLayer",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      ],
      "Resource": [
        "arn:aws:ecr:ap-northeast-2:183548421506:repository/kubernetes-ops-service",
        "arn:aws:ecr:ap-northeast-2:183548421506:repository/kubernetes-ops-console"
      ]
    },
    {
      "Sid": "DescribeManagementEksOnly",
      "Effect": "Allow",
      "Action": "eks:DescribeCluster",
      "Resource": "arn:aws:eks:ap-northeast-2:183548421506:cluster/kubernetes-ops"
    },
    {
      "Sid": "CreateSnapshotsFromStateVolumes",
      "Effect": "Allow",
      "Action": "ec2:CreateSnapshot",
      "Resource": [
        "arn:aws:ec2:ap-northeast-2:183548421506:volume/vol-064de27cf0b56d2c5",
        "arn:aws:ec2:ap-northeast-2:183548421506:volume/vol-06284f30f16497530"
      ]
    },
    {
      "Sid": "RequireTaggedPreflightSnapshots",
      "Effect": "Allow",
      "Action": "ec2:CreateSnapshot",
      "Resource": "arn:aws:ec2:ap-northeast-2::snapshot/*",
      "Condition": {
        "StringEquals": {
          "aws:RequestTag/opsia:backup-kind": "pre-first-deploy"
        }
      }
    },
    {
      "Sid": "TagSnapshotsOnlyDuringCreation",
      "Effect": "Allow",
      "Action": "ec2:CreateTags",
      "Resource": "arn:aws:ec2:ap-northeast-2::snapshot/*",
      "Condition": {
        "StringEquals": {
          "ec2:CreateAction": "CreateSnapshot"
        }
      }
    },
    {
      "Sid": "ReadSnapshotAndVolumeState",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeSnapshots",
        "ec2:DescribeVolumes"
      ],
      "Resource": "*"
    }
  ]
}
JSON

aws iam put-role-policy \
  --profile "${AWS_PROFILE}" \
  --role-name "${DEPLOY_ROLE_NAME}" \
  --policy-name opsia-dev-deploy-minimum \
  --policy-document file:///tmp/opsia-dev-deploy-permissions.json

export DEPLOY_ROLE_ARN="$(aws iam get-role \
  --profile "${AWS_PROFILE}" \
  --role-name "${DEPLOY_ROLE_NAME}" \
  --query 'Role.Arn' --output text)"
printf 'GitHub secret name: AWS_DEV_DEPLOY_ROLE_ARN\nRole ARN: %s\n' "${DEPLOY_ROLE_ARN}"
```

`GetAuthorizationToken`, `DescribeSnapshots`, `DescribeVolumes`는 AWS API가 resource-level
권한을 지원하지 않아 `Resource: "*"`가 필요하다. 나머지 동작은 두 ECR repository, 관리
EKS cluster, PostgreSQL/NATS volume과 snapshot ARN으로 한정한다. RDS 권한은 없다.

### 4.3 EKS API 권한

IAM의 `eks:DescribeCluster`만으로 Kubernetes object에 접근할 수 없다. 아래는 클러스터
관리자가 한 번만 실행하는 bootstrap이며 제품 workload 배포가 아니다. namespaced object는
AWS 관리 access policy를 `management` namespace 하나에만 연결하고, cluster-scoped PV는
`get` 한 동작만 별도 RBAC으로 허용한다.

```bash
aws eks create-access-entry \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}" \
  --cluster-name "${EKS_CLUSTER}" \
  --principal-arn "${DEPLOY_ROLE_ARN}" \
  --kubernetes-groups opsia-dev-deploy-pv-reader \
  --type STANDARD 2>/dev/null || \
aws eks update-access-entry \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}" \
  --cluster-name "${EKS_CLUSTER}" \
  --principal-arn "${DEPLOY_ROLE_ARN}" \
  --kubernetes-groups opsia-dev-deploy-pv-reader

aws eks associate-access-policy \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}" \
  --cluster-name "${EKS_CLUSTER}" \
  --principal-arn "${DEPLOY_ROLE_ARN}" \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy \
  --access-scope type=namespace,namespaces=management
```

```bash
kubectl --context opsia-admin apply -f - <<'YAML'
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: opsia-dev-deploy-pv-reader
rules:
  - apiGroups: [""]
    resources: ["persistentvolumes"]
    verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: opsia-dev-deploy-pv-reader
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: opsia-dev-deploy-pv-reader
subjects:
  - apiGroup: rbac.authorization.k8s.io
    kind: Group
    name: opsia-dev-deploy-pv-reader
YAML
```

## 5. EBS snapshot 생성

첫 배포의 `source_sha`를 정한 뒤 새 snapshot 두 개를 만든다. snapshot 생성부터 첫 배포
완료까지 dev push를 멈춘다.

```bash
git fetch origin dev
export SOURCE_SHA="$(git rev-parse origin/dev)"
test "$(git rev-parse "${SOURCE_SHA}")" = "${SOURCE_SHA}"

gh run list --workflow 'Dev Gate' --branch dev --event push --status success \
  --json headSha,databaseId,conclusion \
  --jq ".[] | select(.headSha == \"${SOURCE_SHA}\") | select(.conclusion == \"success\")"
```

위 명령이 한 줄을 반환할 때만 계속한다.

```bash
export POSTGRES_SNAPSHOT_ID="$(aws ec2 create-snapshot \
  --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --volume-id "${POSTGRES_VOLUME_ID}" \
  --description "opsia-dev-preflight-${SOURCE_SHA}-postgresql" \
  --tag-specifications "ResourceType=snapshot,Tags=[{Key=Name,Value=opsia-dev-preflight-postgresql},{Key=opsia:backup-kind,Value=pre-first-deploy},{Key=opsia:source-sha,Value=${SOURCE_SHA}},{Key=opsia:source-pvc,Value=data-postgresql-0},{Key=opsia:restore-rehearsal,Value=pending}]" \
  --query SnapshotId --output text)"

export NATS_SNAPSHOT_ID="$(aws ec2 create-snapshot \
  --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --volume-id "${NATS_VOLUME_ID}" \
  --description "opsia-dev-preflight-${SOURCE_SHA}-nats" \
  --tag-specifications "ResourceType=snapshot,Tags=[{Key=Name,Value=opsia-dev-preflight-nats},{Key=opsia:backup-kind,Value=pre-first-deploy},{Key=opsia:source-sha,Value=${SOURCE_SHA}},{Key=opsia:source-pvc,Value=data-nats-0},{Key=opsia:restore-rehearsal,Value=pending}]" \
  --query SnapshotId --output text)"

aws ec2 wait snapshot-completed --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --snapshot-ids "${POSTGRES_SNAPSHOT_ID}" "${NATS_SNAPSHOT_ID}"
aws ec2 describe-snapshots --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --snapshot-ids "${POSTGRES_SNAPSHOT_ID}" "${NATS_SNAPSHOT_ID}" \
  --query 'Snapshots[].{Id:SnapshotId,State:State,Volume:VolumeId,Encrypted:Encrypted,Tags:Tags}'
```

## 6. 격리 restore 리허설

live PVC를 분리하거나 수정하지 않는다. snapshot으로 새 volume을 만들고 격리된 PV/PVC에
연결한다. 이 절차는 관리자 profile로 실행하며 OIDC 배포 역할에는 volume 생성·삭제 권한을
주지 않는다.

```bash
export POSTGRES_RESTORE_VOLUME_ID="$(aws ec2 create-volume \
  --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --availability-zone "${POSTGRES_AZ}" --snapshot-id "${POSTGRES_SNAPSHOT_ID}" \
  --volume-type gp3 \
  --tag-specifications "ResourceType=volume,Tags=[{Key=Name,Value=opsia-restore-postgresql-${SOURCE_SHA}}]" \
  --query VolumeId --output text)"
export NATS_RESTORE_VOLUME_ID="$(aws ec2 create-volume \
  --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --availability-zone "${NATS_AZ}" --snapshot-id "${NATS_SNAPSHOT_ID}" \
  --volume-type gp3 \
  --tag-specifications "ResourceType=volume,Tags=[{Key=Name,Value=opsia-restore-nats-${SOURCE_SHA}}]" \
  --query VolumeId --output text)"
aws ec2 wait volume-available --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --volume-ids "${POSTGRES_RESTORE_VOLUME_ID}" "${NATS_RESTORE_VOLUME_ID}"
```

PostgreSQL 복원본을 기동하고 핵심 table row count를 확인한다. Secret 값은 출력하지 않는다.

```bash
kubectl --context opsia-admin apply -f - <<YAML
apiVersion: v1
kind: PersistentVolume
metadata: {name: opsia-restore-postgresql}
spec:
  capacity: {storage: 30Gi}
  accessModes: [ReadWriteOnce]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: ""
  csi:
    driver: ebs.csi.aws.com
    volumeHandle: ${POSTGRES_RESTORE_VOLUME_ID}
    fsType: ext4
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions:
            - key: topology.kubernetes.io/zone
              operator: In
              values: [${POSTGRES_AZ}]
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: opsia-restore-postgresql, namespace: management}
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: ""
  volumeName: opsia-restore-postgresql
  resources: {requests: {storage: 30Gi}}
---
apiVersion: v1
kind: Pod
metadata: {name: opsia-restore-postgresql, namespace: management}
spec:
  restartPolicy: Never
  containers:
    - name: postgresql
      image: postgres:17-alpine
      env:
        - {name: PGDATA, value: /var/lib/postgresql/data/pgdata}
      command: ["sh", "-ec"]
      args:
        - |
          rm -f "\${PGDATA}/postmaster.pid"
          exec postgres
      volumeMounts:
        - {name: data, mountPath: /var/lib/postgresql/data}
  volumes:
    - name: data
      persistentVolumeClaim: {claimName: opsia-restore-postgresql}
YAML

kubectl --context opsia-admin -n management wait \
  --for=condition=Ready pod/opsia-restore-postgresql --timeout=300s
kubectl --context opsia-admin -n management exec opsia-restore-postgresql -- \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc \
  "SELECT 'user_accounts=' || count(*) FROM public.user_accounts; SELECT 'events=' || count(*) FROM public.events;"
```

두 count가 모두 0보다 큰지 확인한다. NATS 복원본은 JetStream stream 수를 확인한다.

```bash
kubectl --context opsia-admin apply -f - <<YAML
apiVersion: v1
kind: PersistentVolume
metadata: {name: opsia-restore-nats}
spec:
  capacity: {storage: 5Gi}
  accessModes: [ReadWriteOnce]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: ""
  csi:
    driver: ebs.csi.aws.com
    volumeHandle: ${NATS_RESTORE_VOLUME_ID}
    fsType: ext4
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions:
            - key: topology.kubernetes.io/zone
              operator: In
              values: [${NATS_AZ}]
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: opsia-restore-nats, namespace: management}
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: ""
  volumeName: opsia-restore-nats
  resources: {requests: {storage: 5Gi}}
---
apiVersion: v1
kind: Pod
metadata: {name: opsia-restore-nats, namespace: management}
spec:
  restartPolicy: Never
  containers:
    - name: nats
      image: nats:2.10-alpine
      args: ["-js", "-sd", "/data", "-m", "8222"]
      volumeMounts:
        - {name: data, mountPath: /data}
  volumes:
    - name: data
      persistentVolumeClaim: {claimName: opsia-restore-nats}
YAML

kubectl --context opsia-admin -n management wait \
  --for=condition=Ready pod/opsia-restore-nats --timeout=300s
kubectl --context opsia-admin -n management exec opsia-restore-nats -- \
  wget -qO- http://127.0.0.1:8222/jsz | jq -e '.streams > 0'
```

리허설이 통과하면 snapshot tag를 바꾸고 복원본만 정리한다.

```bash
aws ec2 create-tags --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --resources "${POSTGRES_SNAPSHOT_ID}" "${NATS_SNAPSHOT_ID}" \
  --tags Key=opsia:restore-rehearsal,Value=passed

kubectl --context opsia-admin -n management delete pod \
  opsia-restore-postgresql opsia-restore-nats --wait=true
kubectl --context opsia-admin -n management delete pvc \
  opsia-restore-postgresql opsia-restore-nats --wait=true
kubectl --context opsia-admin delete pv \
  opsia-restore-postgresql opsia-restore-nats --wait=true
aws ec2 wait volume-available --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --volume-ids "${POSTGRES_RESTORE_VOLUME_ID}" "${NATS_RESTORE_VOLUME_ID}"
aws ec2 delete-volume --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --volume-id "${POSTGRES_RESTORE_VOLUME_ID}"
aws ec2 delete-volume --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --volume-id "${NATS_RESTORE_VOLUME_ID}"
```

workflow는 snapshot state, encryption, live PVC의 volume ID, source SHA, source PVC,
`restore-rehearsal=passed`, 생성 시각 24시간 이내를 모두 검사한다. 하나라도 다르면 workload를
변경하지 않는다.

## 7. GitHub 변수와 secret

`dev-deploy` Environment에 아래 이름을 만든다. secret 값은 기존 권위 저장소에서 복사하되
화면 밖으로 출력하지 않는다.

| 종류 | 이름 | 값 또는 출처 |
|---|---|---|
| Variable | `AWS_DEV_REGION` | `ap-northeast-2` |
| Variable | `AWS_DEV_ECR_REPOSITORY` | `kubernetes-ops-service` |
| Variable | `AWS_DEV_CONSOLE_ECR_REPOSITORY` | `kubernetes-ops-console` |
| Variable | `AWS_DEV_EKS_CLUSTER` | `kubernetes-ops` |
| Variable | `AWS_DEV_BASE_URL` | `https://k8s.woonyong.org` |
| Secret | `AWS_DEV_DEPLOY_ROLE_ARN` | 4절에서 출력한 역할 ARN |
| Secret | `AWS_DEV_AUTH_EMAIL` | Secrets Manager `kubeheal/test/team`의 기존 계정 |
| Secret | `AWS_DEV_AUTH_PASSWORD` | 같은 기존 계정 |
| Secret | `AWS_DEV_SMOKE_CLUSTER_ID` | `cluster-1` |
| Secret | `AWS_DEV_SMOKE_RCA_CORRELATION_ID` | `cluster-1`의 검증된 RCA fixture |
| Secret | `AWS_DEV_SMOKE_RCA_INCIDENT_ID` | 같은 fixture의 incident ID |

첫 검증은 이미 live `user_accounts`에 존재하는 `kubeheal/test/team` 계정을 사용한다. 새 계정을
만들지 않는다. `cluster-1`은 현재 서비스 상태 문서의 golden RCA target이므로 smoke 대상으로
고정하고 `cluster-2`는 멀티클러스터 데모 보조 대상으로 유지한다.

`AWS_DEV_DEPLOY_ENABLED`는 만들지 않는다. 첫 배포의 모든 검증이 통과한 뒤 값 `1`로 추가한다.

## 8. Alembic baseline과 cutover

live DB에는 `alembic_version` table이 없고 create-all 기반 부분 schema가 있다. 기존 DB에
revision marker를 기록하거나 `alembic stamp`를 실행하지 않는다. 안전 경계는 새 versioned
DB로의 blue/green cutover다.

1. PostgreSQL snapshot과 restore 리허설을 완료한다.
2. 첫 수동 배포 workflow가 같은 PostgreSQL instance에 run ID와 attempt가 포함된 격리 target
   DB를 만든다. 이전 attempt의 orphan target과 이름이 겹치지 않으며 검증 전 application은 이
   DB를 참조하지 않는다.
3. immutable pre-Alembic schema snapshot의 SHA-256과 source commit을 확인한 뒤 빈 target에만
   `packages.storage.baseline bootstrap`을 실행한다. table이 하나라도 있으면 실행이 거부된다.
4. legacy DB에서 target DB로 data-only 이관한다. schema object를 복사하지 않는다.
5. 공통 table의 row count와 checksum, FK, sequence, catalog fingerprint를 대조한다. 차이가
   하나라도 있으면 cutover하지 않는다.
6. target DB에 대해 `alembic current`와 `alembic heads`가 같은 단일 revision인지 확인한다.
7. workflow는 `management-runtime-secret`을 참조하는 모든 Deployment와 live-only
   `cluster-agent`, `pgbouncer`의 replica를 private plan에 기록한 뒤 0으로 만든다. HPA가 하나라도
   연결돼 있거나 `api-gateway`/`pgbouncer`를 찾지 못하면 중단한다.
8. source table SHARE lock과 read-only snapshot 아래에서 copy가 끝난 뒤에만 direct notify URL과
   PgBouncer mapping을 target으로 전환한다. image rollout 뒤 원 replica를 복원한다.
9. 실패하면 source routing, 이전 image digest, 원 replica를 각각 끝까지 복구한다. 한 복구 명령의
   실패가 다음 복구 시도를 건너뛰지 않으며 DB downgrade는 실행하지 않는다.

live create-all DB에만 남은 `workspace_members` 1행과 `resource_access_grants` table은 현재 ORM 권한
원천이 아니다. 그러나 역할 의미를 canonical 조직 권한과 동일하다고 단정할 수 없어 버리지 않는다.
revision `20260714_0345`가 두 table의 마지막 활성 ORM shape를 migration-only 보존 table로 만들고,
data-only copy가 row count/checksum을 그대로 검증한다. runtime ORM metadata에는 다시 등록하지 않는다.

```bash
export BASELINE_TARGET_DATABASE_URL='<isolated-empty-target-url>'
export BASELINE_CONFIRM_SOURCE_COMMIT='017b2485b2c408c2f7e928379ebf6541526d32ab'
export BASELINE_CONFIRM_EMPTY_TARGET='isolated-empty-database'
export MIGRATION_EXPECTED_HEAD="$(uv run alembic heads | awk '{print $1}')"
uv run python -m packages.storage.baseline verify
uv run python -m packages.storage.baseline bootstrap
```

URL 값은 shell 출력이나 문서에 복사하지 않는다. 실제 snapshot clone에서 새 head까지 bootstrap한
뒤 62개 source table의 row count/checksum·FK·sequence·catalog 검증이 모두 통과하기 전까지
`FIRST_DEPLOY`는 차단 상태다. workflow 배선만 존재한다는 이유로 이 검증을 생략하지 않는다.

## 9. 첫 수동 배포

GitHub Actions에서 `Dev Deploy` → `Run workflow`를 선택한다. 입력값은 다음과 같다.

| 입력 | 값 |
|---|---|
| `source_sha` | 5절에서 고정한 Dev Gate SUCCESS의 40자 dev SHA |
| `postgres_snapshot_id` | restore 리허설을 통과한 PostgreSQL snapshot |
| `nats_snapshot_id` | restore 리허설을 통과한 NATS snapshot |
| `previous_release_sha` | `c704729c1b16a6fd397e1c7285249f80517a01a8` |
| `confirmation` | `FIRST_DEPLOY` |

workflow가 Actions 목록에 보이지 않으면 저장소 기본 브랜치에 workflow가 등록되었는지 먼저
확인한다. 기본 브랜치 변경은 GitHub 설정 사람 게이트이며 코드로 우회하지 않는다.

## 10. 성공 검증

아래가 모두 통과해야 `AWS_DEV_DEPLOY_ENABLED=1`을 설정할 수 있다.

```bash
export EXPECTED_SOURCE_SHA="${SOURCE_SHA}"
export OLD_BUNDLE=index-CTO5IvV4.js

curl -fsS "${BASE_URL}/" -o /tmp/opsia-index.html
test "$(rg -o 'index-[A-Za-z0-9_-]+\.js' /tmp/opsia-index.html | head -1)" != "${OLD_BUNDLE}"
rg -q '<title>[^<]*Opsia[^<]*</title>' /tmp/opsia-index.html
! rg -q '<title>운영 콘솔</title>' /tmp/opsia-index.html
curl -fsS "${BASE_URL}/api/healthz" | jq -e '.status == "ok"'
```

로그인은 secret을 출력하지 않고 cookie jar와 HTTP status만 확인한다.

```bash
read -r -s -p 'AWS_DEV_AUTH_PASSWORD: ' AUTH_PASSWORD; echo
read -r -p 'AWS_DEV_AUTH_EMAIL: ' AUTH_EMAIL
LOGIN_STATUS="$(curl -sS -o /tmp/opsia-login-response.json -w '%{http_code}' \
  -c /tmp/opsia-cookie.jar \
  -H 'content-type: application/json' \
  --data "$(jq -nc --arg email "${AUTH_EMAIL}" --arg password "${AUTH_PASSWORD}" \
    '{email:$email,password:$password}')" \
  "${BASE_URL}/api/auth/login")"
unset AUTH_EMAIL AUTH_PASSWORD
test "${LOGIN_STATUS}" = 200
chmod 600 /tmp/opsia-cookie.jar /tmp/opsia-login-response.json
```

DB revision과 live 보안·image를 확인한다.

```bash
kubectl --context opsia-admin -n management exec statefulset/postgresql -- \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc \
  "SELECT version_num FROM alembic_version;"

test "$(uv run alembic heads | awk '{print $1}')" = \
  "$(kubectl --context opsia-admin -n management exec statefulset/postgresql -- \
    psql -U postgres -d postgres -Atc 'SELECT version_num FROM alembic_version;')"

test "$(kubectl --context opsia-admin -n management get deployment api-gateway \
  -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="DEV_AUTH_BYPASS")].value}')" = 0

CONSOLE_IMAGE="$(kubectl --context opsia-admin -n management get deployment console \
  -o jsonpath='{.spec.template.spec.containers[0].image}')"
printf '%s\n' "${CONSOLE_IMAGE}" | rg -q \
  '^183548421506\.dkr\.ecr\.ap-northeast-2\.amazonaws\.com/kubernetes-ops-console@sha256:[0-9a-f]{64}$'

test "$(kubectl --context opsia-admin -n management get configmap opsia-deploy-status \
  -o jsonpath='{.data.dev_sha}')" = "${EXPECTED_SOURCE_SHA}"
```

브라우저에서 로그인 후 console error가 0이고 클러스터 목록과 incident 목록이 실 API로
표시되는지 확인한다. 전부 통과한 뒤 GitHub `dev-deploy` Environment에
`AWS_DEV_DEPLOY_ENABLED=1`을 추가한다.

## 11. 루트 access key 폐기

현재 CLI identity가 AWS account root다. OIDC 배포는 root key와 무관하므로 관리자 identity를
교체한 뒤 root access key를 삭제해도 배포는 계속된다.

관리자 user와 group을 만든다.

```bash
export ROOT_PROFILE=default
export ADMIN_USER=woonyong-admin
export ADMIN_GROUP=opsia-admins

aws iam create-group --profile "${ROOT_PROFILE}" --group-name "${ADMIN_GROUP}" 2>/dev/null || true
aws iam attach-group-policy --profile "${ROOT_PROFILE}" --group-name "${ADMIN_GROUP}" \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
aws iam create-user --profile "${ROOT_PROFILE}" --user-name "${ADMIN_USER}" 2>/dev/null || true
aws iam add-user-to-group --profile "${ROOT_PROFILE}" --group-name "${ADMIN_GROUP}" \
  --user-name "${ADMIN_USER}"
umask 077
aws iam create-access-key --profile "${ROOT_PROFILE}" --user-name "${ADMIN_USER}" \
  > /tmp/opsia-admin-access-key.json
```

아래 명령은 key 값을 shell history에 남기지 않고 별도 profile에 넣는다.

```bash
aws configure set aws_access_key_id \
  "$(jq -r '.AccessKey.AccessKeyId' /tmp/opsia-admin-access-key.json)" \
  --profile opsia-admin
aws configure set aws_secret_access_key \
  "$(jq -r '.AccessKey.SecretAccessKey' /tmp/opsia-admin-access-key.json)" \
  --profile opsia-admin
aws configure set region ap-northeast-2 --profile opsia-admin
aws sts get-caller-identity --profile opsia-admin
```

출력 ARN이 `user/woonyong-admin`인지 확인한 뒤 root access key ID를 조회해 삭제한다. 삭제할
ID를 화면에서 확인하고 root key만 선택한다.

```bash
export ROOT_KEY_COUNT="$(aws iam list-access-keys --profile "${ROOT_PROFILE}" \
  --query 'length(AccessKeyMetadata)' --output text)"
test "${ROOT_KEY_COUNT}" = 1
export ROOT_ACCESS_KEY_ID="$(aws iam list-access-keys --profile "${ROOT_PROFILE}" \
  --query 'AccessKeyMetadata[0].AccessKeyId' --output text)"
test -n "${ROOT_ACCESS_KEY_ID}"
aws iam delete-access-key --profile "${ROOT_PROFILE}" \
  --access-key-id "${ROOT_ACCESS_KEY_ID}"
unset ROOT_ACCESS_KEY_ID ROOT_KEY_COUNT
```

명령은 root profile에 access key가 정확히 하나일 때만 삭제한다. 0개 또는 2개면 중단하고
AWS Console → Security credentials → Access keys에서 각 key의 사용처를 확인한 뒤 root key를
모두 폐기한다. 성공 확인 후 임시 파일을 지운다.

```bash
rm -f /tmp/opsia-admin-access-key.json \
  /tmp/opsia-dev-deploy-trust.json \
  /tmp/opsia-dev-deploy-permissions.json
aws sts get-caller-identity --profile opsia-admin
```

마지막으로 root user에 MFA를 활성화한다. 장기 운영은 IAM Identity Center로 관리자 로그인을
전환한다. GitHub OIDC 역할은 access key를 사용하지 않으므로 이 교체의 영향을 받지 않는다.
