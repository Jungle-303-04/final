# 찬빈 권한 모델 점검 문서

이 문서는 현재 dev에 반영된 B2B 조직/그룹/리소스 권한 모델의 기준이다.

## 먼저 볼 코드

| 순서 | 파일 | 확인할 것 |
| --- | --- | --- |
| 1 | `src/packages/contracts/identity.py` | 역할 enum, permission, `ROLE_PROFILES`, 기본 role-permission matrix |
| 2 | `src/domains/identity/models.py` | 조직/그룹/리소스 배정/조직별 role permission 테이블 |
| 3 | `src/domains/identity/repository.py` | `can_access` 판단 순서와 `role_permissions.organization_id` fallback |
| 4 | `src/domains/identity/dependencies.py` | FastAPI route에서 `can_access`를 호출하는 guard |
| 5 | `src/domains/command/router.py` | command는 `deploy.run`, debug query는 `evidence.read` |
| 6 | `src/domains/gitops/router.py` | approval grant/reject는 `deploy.run` |
| 7 | `src/domains/dashboard/router.py` | RCA 목록/상세는 `rca.read` |
| 8 | `tests/test_identity_repository.py` | 조직 구성원만으로는 클러스터 작업이 안 되는 테스트 |
| 9 | `tests/test_password_auth.py` | 세션 역할은 `service_admin` 또는 `user` |
| 10 | `tests/test_database_unit.py` | 구 `workspace_members/resource_access_grants` 테이블 제거 확인 |

## 역할 프로필

| 구분 | 역할 | 범위 | 할 수 있는 일 | 할 수 없는 일 |
| --- | --- | --- | --- | --- |
| 서비스 | `service_admin` | 서비스 전체 | 모든 조직/사용자/클러스터/정책 관리, 긴급 복구 | 감사 로그 없이 운영 작업 수행 |
| 조직 | `owner` | 특정 조직 | 조직 삭제/상태 변경, 소유자 지정, 조직 정책 관리 | 다른 조직 접근, 리소스 역할 없는 클러스터 작업 |
| 조직 | `admin` | 특정 조직 | 멤버 관리, 그룹 생성, 리소스를 그룹에 배정 | 조직 삭제, 소유자 지정, 직접 클러스터 작업 |
| 그룹 | `manager` | 특정 그룹 | 그룹 멤버 관리, 그룹 리소스 역할 부여 | 자기 승격, 조직 전체 관리 |
| 기본 | `member` | 소속 조직/그룹 | 로그인, 자기 정보 조회, 배정 확인 | 기본 클러스터 접근 |
| 리소스 | `observer` | 특정 리소스 | `cluster.read`, `dashboard.read`, `evidence.read`, `rca.read`, `manifest.read` | 배포/수정/삭제 |
| 리소스 | `release_operator` | 특정 리소스 | 관측 + `deploy.run`, `workload.scale`, `image.update`, `config.update` | 위험 작업, 권한 관리 |
| 리소스 | `incident_operator` | 특정 리소스 | 배포 + `restart.run`, `rollback.run`, `incident.respond` | 클러스터 권한 부여/회수 |
| 리소스 | `cluster_steward` | 특정 리소스 | 운영 + `cluster.policy.manage`, `cluster.role.manage`, `dangerous_action.approve` | 조직 멤버/그룹 자체 관리 |

## 판단 순서

`can_access(user_id, organization_id, resource_type, resource_id, permission)`는 아래 순서로 판단한다.

1. 사용자가 `service_admin`이면 허용한다.
2. 사용자가 해당 조직의 active 멤버인지 확인한다.
3. 해당 리소스가 조직의 어떤 그룹에 배정됐는지 확인한다.
4. 사용자가 그 그룹의 active 멤버인지 확인한다.
5. 사용자가 그 리소스 배정에서 어떤 리소스 역할을 받았는지 확인한다.
6. `role_permissions`에서 그 역할이 요청 permission을 갖는지 확인한다.

조직 관리자라도 5번의 리소스 역할이 없으면 클러스터 배포/수정/조회 작업은 실패한다.

## role_permissions 스코프

`role_permissions`는 `organization_id`를 포함한다.

| 스코프 | 의미 |
| --- | --- |
| `__global__` | 서비스 기본 정책. 서비스 최고 관리자만 관리해야 한다. |
| 실제 조직 ID | 특정 조직 커스텀 정책. 그 조직 안에서만 적용된다. |

조직별 row가 하나라도 있으면 그 조직 정책을 우선 사용한다. 조직별 row가 없으면 `__global__` 기본값으로 fallback한다. 그래서 한 조직의 정책 변경이 전체 서비스에 번지지 않는다.

## 현재 보장되는 것

- `viewer/developer/deployer/maintainer` 같은 구 리소스 역할명은 runtime 권한 원천이 아니다.
- compatibility migration이 기존 DB row를 canonical 역할(`observer`, `release_operator`, `incident_operator`, `cluster_steward`)과 permission(`cluster.read`, `config.update`, `deploy.run`, `cluster.role.manage`)으로 변환한 뒤 코드 fallback은 사용하지 않는다.
- 구 테이블 `workspace_members`, `resource_access_grants`는 ORM metadata와 required table 목록에서
  빠졌다. 기존 live row를 첫 versioned cutover에서 버리지 않기 위해 Alembic target에는 migration-only
  보존 table로만 남으며 runtime 권한 원천으로 조회하지 않는다.
- 세션 역할은 서비스 레벨인 `service_admin` 또는 `user`다.
- 조직/그룹 관리 권한과 클러스터 작업 권한은 분리되어 있다.
- 기본 조직 구성원은 클러스터를 제어할 수 없다.
- `release_operator` 이상만 배포/승인 실행 permission을 가진다.

## 검증

```bash
uv run pytest -q tests/test_schemas.py tests/test_identity_repository.py tests/test_command_router.py tests/test_dashboard_router.py tests/test_gitops_approval_router.py tests/test_password_auth.py tests/test_database_unit.py
```
