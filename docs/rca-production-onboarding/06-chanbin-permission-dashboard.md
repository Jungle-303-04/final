# 찬빈: 권한 시스템과 대시보드 적용

찬빈 파트에서 가장 중요한 기준은 이것이다.

프론트는 사용성을 위해 버튼을 숨기거나 비활성화할 수 있지만, 보안 판단은 반드시 백엔드가 한다.

## 먼저 열 파일 순서

| 순서 | 파일 | 무엇을 봐야 하는가 |
| --- | --- | --- |
| 1 | `docs/team/member-guides/chanbin-permission-model.md` | 최종 권한 모델, 볼 코드 목록, 검증 명령 |
| 2 | `src/packages/contracts/identity.py` | 서비스/조직/그룹/리소스 역할과 permission profile |
| 3 | `src/domains/identity/models.py` | organization/group/resource assignment/role policy table |
| 4 | `src/domains/identity/repository.py` | `can_access`와 조직별 `role_permissions` fallback |
| 5 | `src/domains/identity/dependencies.py` | FastAPI route에서 쓰는 권한 helper |
| 6 | `src/domains/command/router.py` | command/debug query 권한 적용 예시 |
| 7 | `src/domains/gitops/router.py` | approval 권한 적용 예시 |
| 8 | `src/services/realtime/realtime-gateway/app.py` | browser websocket session/workspace 검사 |
| 9 | `tests/test_identity_repository.py` | 목록 필터 테스트 |
| 10 | `tests/test_command_router.py` | command/read 권한 테스트 |

## 현재 역할과 permission

파일: `src/packages/contracts/identity.py`

| 역할 | 범위 | 주요 permission | 화면 의미 |
| --- | --- | --- | --- |
| `service_admin` | 서비스 전체 | 모든 permission | 전체 조직/사용자/정책을 관리한다. 모든 행동은 감사 로그 대상이다. |
| `owner` | 조직 | 조직 삭제/상태/소유자/정책/그룹/리소스 배정 | 조직 구조를 관리한다. 클러스터 작업은 별도 리소스 역할이 필요하다. |
| `admin` | 조직 | 멤버 관리, 그룹 생성, 리소스 배정 | 사람과 구조를 관리한다. 직접 배포/수정은 못 한다. |
| `manager` | 그룹 | 그룹 멤버 관리, 리소스 역할 부여 | 자기 승격 없이 그룹 안에서 낮은 역할을 부여한다. |
| `member` | 조직/그룹 | `profile.read` | 기본 로그인/프로필/배정 확인만 가능하다. |
| `observer` | 리소스 | `cluster.read`, `dashboard.read`, `evidence.read`, `rca.read`, `manifest.read` | RCA/cluster 상태만 본다. |
| `release_operator` | 리소스 | 관측 + `deploy.run`, `workload.scale`, `image.update`, `config.update` | 승인된 배포와 일반 변경 버튼을 쓸 수 있다. |
| `incident_operator` | 리소스 | 배포 + `restart.run`, `rollback.run`, `incident.respond` | 장애 대응과 rollback을 수행한다. |
| `cluster_steward` | 리소스 | 운영 + `cluster.policy.manage`, `cluster.role.manage`, `dangerous_action.approve` | 해당 클러스터의 운영 정책과 리소스 역할을 관리한다. |

이 matrix는 `RESOURCE_ROLE_PERMISSIONS`, `ROLE_PROFILES`, `role_permissions`가 단일 출처다. 화면에서 따로 문자열 matrix를 만들지 말고 backend response나 같은 계약을 기준으로 표시한다.

## 백엔드 권한 함수

| 함수 | 위치 | 언제 쓰는가 |
| --- | --- | --- |
| `require_session(request)` | `identity/dependencies.py` | 로그인 사용자가 필요한 모든 dashboard/query API |
| `require_admin_session(request)` | `identity/dependencies.py` | 서비스 최고 관리자 전용 API |
| `require_resource_access(...)` | `identity/dependencies.py` | repository/cluster/binding 같은 단건 resource API |
| `require_cluster_access(...)` | `identity/dependencies.py` | cluster 단건 permission 검사 |
| `user_has_resource_access(...)` | `identity/repository.py` | helper 내부 단건 검사 |
| `accessible_resource_ids(...)` | `identity/repository.py` | dashboard 목록 query filter |
| `require_cluster_agent(request)` | `identity/dependencies.py` | target agent 전용 route |

## 목록 조회는 accessible_resource_ids를 쓴다

대시보드 list API는 단건 권한 검사만으로는 부족하다.

예를 들어 사용자가 `cluster-1`만 볼 수 있는데, API가 workspace 전체 timeline을 내려주면 UI가 숨겨도 이미 데이터가 나간 것이다.

구현 기준:

```python
allowed_cluster_ids = db.accessible_resource_ids(
    current.user_id,
    workspace_id,
    AccessResourceType.CLUSTER.value,
    Permission.RCA_READ.value,
)

query = query.where(table.c.workspace_id == workspace_id)
if allowed_cluster_ids is not None:
    query = query.where(table.c.cluster_id.in_(allowed_cluster_ids))
```

`allowed_cluster_ids is None`은 막연한 전체 허용이 아니다. 서비스 최고 관리자라 전체 리소스가 허용된다는 뜻이다.

## route별 권한 기준

| route | 현재 코드 | 필요한 권한 | 이유 |
| --- | --- | --- | --- |
| `GET /auth/session` | `identity/router.py` | session | 프론트가 로그인/역할/workspace를 확인한다. |
| `POST /commands` | `command/router.py` | cluster `deploy.run` | target cluster에 실제 write command를 보낸다. |
| `POST /agent/debug/query` | `command/router.py` | cluster `evidence.read` | 데이터 조회용 query이므로 deploy까지 요구하지 않는다. |
| `POST /approvals/{approval_id}/grant` | `gitops/router.py` | cluster `deploy.run` | 승인하면 command로 이어진다. |
| `POST /approvals/{approval_id}/reject` | `gitops/router.py` | cluster `deploy.run` | 배포 결정권이 있어야 거절도 할 수 있다. |
| `PUT /clusters/{cluster_id}/policy` | `target/router.py` | `service_admin` | agent policy 변경은 전체 수집/제어 동작에 영향을 준다. |
| `GET /dashboard/rca/timeline` | `dashboard/router.py` | session + cluster `rca.read` 목록 필터 | 사용자가 볼 수 있는 cluster의 RCA 흐름만 내려준다. |
| `GET /dashboard/rca/incidents/{incident_id}` | `dashboard/router.py` | session + cluster `rca.read` 목록 필터 | incident 상세도 허용된 cluster 안에서만 찾는다. |
| `/agent/*` command/evidence/policy | 여러 router | `x-agent-token` | agent 전용이며 session이 아니라 per-cluster token으로 인증한다. |
| `/live/browser` | `realtime-gateway/app.py` | browser session + workspace match | realtime도 workspace 밖 데이터를 받으면 안 된다. |
| `/live/agent` | `realtime-gateway/app.py` | `x-agent-token` | agent가 자기 cluster 외 데이터를 publish하지 못하게 한다. |

## 프론트에서 처리할 것

프론트는 보안의 최종 책임자가 아니다. 그래도 사용자가 실패할 요청을 누르지 않게 아래 처리를 한다.

| 화면 동작 | 프론트 처리 | 백엔드 처리 |
| --- | --- | --- |
| RCA timeline 보기 | `/auth/session` 성공 후 query API 호출 | `require_session`, `accessible_resource_ids` |
| cluster filter | session workspace 안의 cluster만 표시 | query에서 workspace/resource filter |
| command 실행 버튼 | `release_operator` 이상에게만 활성화 | `/commands`에서 cluster `deploy.run` 검사 |
| debug query 버튼 | `observer` 이상에게 활성화 | `/agent/debug/query`에서 cluster `evidence.read` 검사 |
| approval 버튼 | `release_operator` 이상에게 활성화 | approval route에서 cluster `deploy.run` 검사 |
| PR 링크 | `safe_pr.created` 이후에만 클릭 가능 | PR URL은 `scm-worker` 결과 event에서만 온다. |
| realtime 연결 | 로그인 후 workspace_id로 연결 | websocket에서 session workspace와 query workspace 일치 검사 |

## 절대 하면 안 되는 것

- frontend가 `workspace_id`를 임의로 바꿔 다른 workspace를 조회하게 두지 않는다.
- UI에서 버튼을 숨겼다고 backend 권한 검사를 생략하지 않는다.
- browser에서 NATS, DB, agent queue에 직접 붙지 않는다.
- event payload 전체를 화면에서 직접 파싱하지 않는다.
- `x-agent-token`을 browser에 전달하지 않는다.
- agent route를 사용자 session으로 호출하지 않는다.

## 현재 Dashboard API 코드 흐름

### 1. DTO

파일:

- `src/packages/contracts/gateway/responses.py`

현재 DTO:

- `RcaTimelineItem`
- `RcaTimelineResponse`
- `RcaIncidentResponse`

왜 먼저 하는가:

- 프론트와 백엔드가 같은 response shape를 보고 작업한다.
- UI가 event 내부 구조에 묶이지 않는다.

### 2. route 상수

파일:

- `src/packages/contracts/gateway/routes.py`

현재 route:

```python
DASHBOARD_RCA_TIMELINE_PATH = "/dashboard/rca/timeline"
DASHBOARD_RCA_INCIDENT_PATH = "/dashboard/rca/incidents/{incident_id}"
```

### 3. repository query에서 권한 필터를 적용한다

구현 위치:

- `src/domains/dashboard/repository.py`

기준:

- 모든 query는 `workspace_id == current.workspace_id`가 먼저다.
- cluster 데이터는 `accessible_resource_ids(..., Permission.RCA_READ.value)`로 좁힌다.
- 단건 cluster detail은 `require_cluster_access(..., Permission.RCA_READ.value)`를 통과해야 한다.
- `allowed_cluster_ids`가 빈 set이면 빈 목록을 반환한다.
- `allowed_cluster_ids`가 `None`이면 서비스 최고 관리자라 전체 row를 볼 수 있다는 뜻이다.

### 4. router에서 session을 요구한다

예시:

```python
@router.get(DASHBOARD_RCA_TIMELINE_PATH, response_model=RcaTimelineResponse)
async def rca_timeline(
    cluster_id: str | None = None,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> RcaTimelineResponse:
    workspace_id = current.workspace_id
    if cluster_id is None:
        allowed_cluster_ids = db.accessible_resource_ids(
            current.user_id,
            workspace_id,
            AccessResourceType.CLUSTER.value,
            Permission.RCA_READ.value,
        )
    else:
        require_cluster_access(db, current, workspace_id, cluster_id, Permission.RCA_READ.value)
        allowed_cluster_ids = {cluster_id}
    rows = db.list_rca_timeline(workspace_id, allowed_cluster_ids)
    return RcaTimelineResponse(items=[RcaTimelineItem(**row) for row in rows])
```

### 5. frontend는 response만 렌더링한다

프론트 상태:

- `loading`
- `unauthenticated`
- `forbidden`
- `empty`
- `ready`
- `error`

각 상태는 API response status를 기준으로 만든다.

## Realtime 권한 흐름

현재 적용된 코드:

- `src/services/realtime/realtime-gateway/app.py`

browser 연결:

```text
browser
  -> /live/browser?workspace_id=...
  -> service_session cookie 또는 x-session-token 확인
  -> Redis session 조회
  -> session.workspace_id == query.workspace_id 인지 검사
  -> 통과하면 snapshot/live message fan-out
```

agent 연결:

```text
cluster-agent
  -> /live/agent?cluster_id=...
  -> x-agent-token hash로 cluster registry 조회
  -> token의 cluster_id와 query/payload cluster_id 일치 검사
  -> 통과하면 hub publish
```

## 테스트

권한만 빠르게 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_identity_repository.py \
  tests/test_command_router.py \
  tests/test_gitops_approval_router.py \
  tests/test_auth_security.py \
  tests/test_realtime_gateway.py \
  -q
```

dashboard API 테스트는 현재 추가되어 있다.

| 테스트 | 확인할 것 |
| --- | --- |
| `tests/test_dashboard_router.py` | list query가 `accessible_resource_ids`를 사용한다. |
| `tests/test_dashboard_router.py` | `cluster_id` query는 `require_cluster_access(..., read)`를 통과해야 한다. |
| `tests/test_dashboard_router.py` | incident detail은 허용된 cluster 안에서만 row를 찾는다. |
| `tests/test_dashboard_projection.py` | `rca.completed`가 timeline row로 변환된다. |
| `tests/test_dashboard_projection.py` | event 재처리 시 timeline row upsert SQL을 사용한다. |
| `tests/test_dashboard_projection.py` | `safe_pr.requested`와 `safe_pr.created` 상태 분리 |

바로 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_dashboard_projection.py \
  tests/test_dashboard_router.py \
  tests/test_identity_repository.py \
  tests/test_command_router.py \
  tests/test_realtime_gateway.py \
  -q
```

## 구현 완료 기준

- frontend는 `/auth/session` 없이 dashboard API를 호출하지 않는다.
- dashboard query API는 `require_session`을 사용한다.
- list query는 `accessible_resource_ids`를 사용한다.
- 단건 cluster API는 `require_cluster_access`를 사용한다.
- realtime browser는 session workspace와 query workspace가 다르면 연결을 닫는다.
- deploy/write 버튼은 UI에서 비활성화되고, backend에서도 403으로 막힌다.
- agent token은 browser에 절대 노출되지 않는다.
