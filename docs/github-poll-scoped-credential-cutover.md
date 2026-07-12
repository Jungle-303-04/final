# GitHub poll scoped credential 전환 감사와 cutover

이 문서는 DB에서 로드한 GitHub poll target이 process-wide `GITHUB_TOKEN_REF` 또는
`GITHUB_TOKEN`을 더 이상 빌리지 않는 변경의 머지 전 운영 절차다. 코드나 DB schema를
변경하는 지시서가 아니라, 기존 데이터를 감사하고 저장소별 credential을 안전하게
등록하기 위한 runbook이다.

현재 동작의 기준은 다음과 같다.

- DB target의 `git_repositories.credential_ref`가 비어 있으면 익명으로 poll한다.
- `credential_ref = 'public:anonymous'`도 의도적으로 익명으로 poll한다.
- private repository는 `db:github:repository:<repository_id>` 형식의 scoped ref가
  repository row에 연결돼 있어야 한다.
- DB에는 GitHub visibility를 보장하는 별도 컬럼이 없다. `access_policy`의 표지는
  참고 자료일 뿐이므로 visibility가 비어 있는 행을 public으로 간주하면 안 된다.

## 머지 전 판정 순서

1. 아래의 legacy repository 감사를 먼저 실행한다. URL, SSH, `.git`, mixed-case row가
   있으면 credential 등록보다 먼저 canonical identity와 충돌 여부를 수동으로 정리한다.
2. active 익명 poll target 감사를 실행한다.
3. `declared_private`는 scoped credential 등록 대상으로 확정한다.
4. `visibility_unknown`은 관리자 credential로 GitHub probe한다. private이면 등록하고,
   public이면 변경 티켓에 probe 결과를 남긴다.
5. gateway를 poll worker보다 먼저 canary 배포하고 scoped credential을 저장한다.
6. 검토된 allowlist에 한해 repository row에 credential ref를 연결한다.
7. 등록 결과와 실제 GitHub 접근을 검증한 뒤에만 새 poll worker를 rollout한다.
8. rollout 직전에 익명 target 감사를 다시 실행해 그 사이 추가된 target이 없는지 본다.

## 영향받는 active DB poll target 식별

다음 read-only query는 `list_active_github_poll_targets()`와 같은 repository,
application, binding, watch 상태 조건을 사용한다. `declared_public`은 결과에서 제외하되,
visibility 표지가 없는 행은 반드시 `visibility_unknown`으로 남긴다.

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

WITH active_poll_targets AS (
    SELECT
        b.workspace_id,
        r.repository_id,
        r.repo_ref,
        r.credential_ref,
        r.access_policy,
        a.application_id,
        b.binding_id,
        COALESCE(
            watch_by_id.watch_target_id,
            watch_by_source.watch_target_id,
            b.watch_target_id
        ) AS watch_target_id
    FROM deployment_bindings AS b
    JOIN git_repositories AS r
      ON r.workspace_id = b.workspace_id
     AND r.repository_id = b.repository_id
    JOIN applications AS a
      ON a.workspace_id = b.workspace_id
     AND a.repository_id = b.repository_id
     AND a.name = b.app_name
    LEFT JOIN git_watch_targets AS watch_by_id
      ON watch_by_id.workspace_id = b.workspace_id
     AND watch_by_id.repository_id = b.repository_id
     AND watch_by_id.watch_target_id = b.watch_target_id
    LEFT JOIN git_watch_targets AS watch_by_source
      ON watch_by_id.watch_target_id IS NULL
     AND watch_by_source.workspace_id = b.workspace_id
     AND watch_by_source.repository_id = b.repository_id
     AND watch_by_source.branch = r.default_branch
     AND watch_by_source.manifest_path = COALESCE(b.manifest_path, a.manifest_path)
    WHERE r.provider = 'github'
      AND r.status = 'active'
      AND a.status = 'active'
      AND b.status = 'active'
      AND (
          COALESCE(watch_by_id.status, watch_by_source.status) IS NULL
          OR COALESCE(watch_by_id.status, watch_by_source.status) = 'active'
      )
),
classified AS (
    SELECT
        *,
        CASE
            WHEN lower(COALESCE(access_policy ->> 'visibility', '')) = 'private'
              OR lower(COALESCE(access_policy ->> 'private', '')) IN ('true', '1', 'yes')
              OR lower(COALESCE(access_policy ->> 'public', '')) IN ('false', '0', 'no')
                THEN 'declared_private'
            WHEN lower(COALESCE(access_policy ->> 'visibility', '')) = 'public'
              OR lower(COALESCE(access_policy ->> 'private', '')) IN ('false', '0', 'no')
              OR lower(COALESCE(access_policy ->> 'public', '')) IN ('true', '1', 'yes')
                THEN 'declared_public'
            ELSE 'visibility_unknown'
        END AS visibility_evidence
    FROM active_poll_targets
)
SELECT
    workspace_id,
    repository_id,
    repo_ref,
    credential_ref,
    visibility_evidence,
    'repository:' || repository_id AS expected_scope,
    'db:github:repository:' || repository_id AS expected_credential_ref,
    count(DISTINCT application_id) AS application_count,
    count(DISTINCT binding_id) AS binding_count,
    array_agg(DISTINCT application_id) AS application_ids,
    array_agg(DISTINCT binding_id) AS binding_ids
FROM classified
WHERE (
        NULLIF(btrim(credential_ref), '') IS NULL
        OR credential_ref = 'public:anonymous'
      )
  AND visibility_evidence <> 'declared_public'
GROUP BY
    workspace_id,
    repository_id,
    repo_ref,
    credential_ref,
    visibility_evidence
ORDER BY
    CASE visibility_evidence
        WHEN 'declared_private' THEN 0
        ELSE 1
    END,
    workspace_id,
    repo_ref;

ROLLBACK;
```

`public:anonymous`도 token이 없는 상태다. private 표지와 함께 있으면 즉시 장애
후보다. `visibility_unknown`은 먼저 token 없이 `/repos/validate`를 호출한다. 접근에
성공하고 `private=false`이면 credential을 저장하지 않은 채 public으로 판정할 수 있다.
익명 접근이 실패하면 존재하지 않는 저장소와 private 저장소를 구분할 수 없으므로,
허가된 scoped credential로 다시 호출해 접근 성공과 `private=true`를 함께 확인한다.

## scoped credential 등록

각 private repository에 polling에 필요한 최소 read 범위만 가진 별도 credential을
준비한다. 조직 전체나 여러 workspace가 공유하는 token을 사용하지 않는다. gateway와
poll worker에는 같은 `CREDENTIAL_ENCRYPTION_KEY`가 주입돼 있어야 한다.

관리자 session으로 `POST /repos/validate`를 호출하면 gateway가 token을 암호화해
`workspace_credentials`에 다음 identity로 upsert한다.

- provider: `github`
- scope: `repository:<repository_id>`
- credential ref: `db:github:repository:<repository_id>`

아래 예시는 token을 URL, process argument, shell history에 넣지 않는다. 실행 전에
shell tracing을 끄고 `curl -v`와 request body logging을 사용하지 않는다.

```bash
set +x
read -r -p "repository (owner/repo): " REPO_REF
read -r -s -p "repository-scoped GitHub credential: " GITHUB_REPOSITORY_TOKEN
printf '\n'

response="$({
  jq -n \
    --arg url "$REPO_REF" \
    --arg token "$GITHUB_REPOSITORY_TOKEN" \
    '{url: $url, token: $token}'
} | curl --fail-with-body --silent --show-error \
  --request POST \
  --header 'content-type: application/json' \
  --cookie "$SESSION_COOKIE_FILE" \
  --data-binary @- \
  "${API_BASE_URL%/}/repos/validate")"
unset GITHUB_REPOSITORY_TOKEN
printf '%s\n' "$response" | jq '{accessible, private, normalized, credential_ref, code}'
```

`API_BASE_URL`은 외부 API root까지 포함한다. 예를 들어 API가 `/api` 아래에 있으면
`https://management.example.com/api`다. `SESSION_COOKIE_FILE`은 해당 workspace의
관리자 session cookie file이다. 응답은 `accessible=true`, `private=true`, canonical
`normalized`, 예상 형식의 `credential_ref`를 모두 만족해야 한다.

중요하게도 `/repos/validate`는 암호화된 credential row만 저장한다.
`git_repositories.credential_ref`는 갱신하지 않으므로 이 호출만으로 poll worker가
credential을 사용하게 되지는 않는다.

### 저장 결과 검증

다음 query는 ciphertext 자체를 출력하지 않고 존재 여부와 형식, repository 연결만
검사한다.

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT
    r.workspace_id,
    r.repository_id,
    r.repo_ref,
    r.credential_ref AS attached_ref,
    'db:github:repository:' || r.repository_id AS expected_ref,
    wc.credential_id,
    wc.status AS credential_status,
    CASE
        WHEN wc.credential_id IS NULL THEN 'credential_row_missing'
        WHEN wc.status <> 'active' THEN 'credential_inactive'
        WHEN NULLIF(btrim(wc.encrypted_value), '') IS NULL THEN 'ciphertext_empty'
        WHEN wc.encrypted_value NOT LIKE 'fernet:v1:%' THEN 'ciphertext_format_invalid'
        WHEN r.credential_ref IS DISTINCT FROM
             ('db:github:repository:' || r.repository_id)
            THEN 'repository_ref_not_attached'
        ELSE 'sql_shape_ok'
    END AS verification
FROM git_repositories AS r
LEFT JOIN workspace_credentials AS wc
  ON wc.workspace_id = r.workspace_id
 AND wc.provider = 'github'
 AND wc.scope = 'repository:' || r.repository_id
WHERE r.provider = 'github'
  AND r.status = 'active'
ORDER BY r.workspace_id, r.repo_ref;

ROLLBACK;
```

### 검토된 repository에 ref 연결

아래 transaction의 allowlist에는 앞선 감사와 probe를 마친 행만 적는다. plaintext
token은 SQL에 넣지 않는다. credential row가 없거나 inactive이거나 ciphertext 형식이
맞지 않으면 전체 transaction이 실패한다. 기존의 다른 credential ref도 덮어쓰지 않는다.

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE credential_rollout_allowlist (
    workspace_id text NOT NULL,
    repository_id text NOT NULL,
    PRIMARY KEY (workspace_id, repository_id)
) ON COMMIT DROP;

-- 운영자가 감사와 probe를 완료한 행만 명시한다.
INSERT INTO credential_rollout_allowlist (workspace_id, repository_id)
VALUES
    ('<workspace-id>', '<repository-id>');

SELECT
    r.workspace_id,
    r.repository_id,
    r.repo_ref,
    r.credential_ref
FROM git_repositories AS r
JOIN credential_rollout_allowlist AS allowlist
  ON allowlist.workspace_id = r.workspace_id
 AND allowlist.repository_id = r.repository_id
FOR UPDATE OF r;

-- allowlist의 모든 repository가 정확히 이 전환의 대상인지 검증한다.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM credential_rollout_allowlist AS allowlist
        LEFT JOIN git_repositories AS r
          ON r.workspace_id = allowlist.workspace_id
         AND r.repository_id = allowlist.repository_id
        WHERE r.repository_id IS NULL
           OR r.provider <> 'github'
           OR r.status <> 'active'
           OR NOT (
               NULLIF(btrim(r.credential_ref), '') IS NULL
               OR r.credential_ref = 'public:anonymous'
           )
    ) THEN
        RAISE EXCEPTION 'allowlist contains an ineligible repository';
    END IF;
END
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM credential_rollout_allowlist AS allowlist
        LEFT JOIN workspace_credentials AS wc
          ON wc.workspace_id = allowlist.workspace_id
         AND wc.provider = 'github'
         AND wc.scope = 'repository:' || allowlist.repository_id
         AND wc.status = 'active'
        WHERE wc.credential_id IS NULL
           OR NULLIF(btrim(wc.encrypted_value), '') IS NULL
           OR wc.encrypted_value NOT LIKE 'fernet:v1:%'
    ) THEN
        RAISE EXCEPTION 'scoped GitHub credential is missing or invalid';
    END IF;
END
$$;

UPDATE git_repositories AS r
SET credential_ref = 'db:github:repository:' || r.repository_id,
    updated_at = now()
FROM credential_rollout_allowlist AS allowlist
WHERE r.workspace_id = allowlist.workspace_id
  AND r.repository_id = allowlist.repository_id
  AND r.provider = 'github'
  AND r.status = 'active'
  AND (
      NULLIF(btrim(r.credential_ref), '') IS NULL
      OR r.credential_ref = 'public:anonymous'
  )
RETURNING
    r.workspace_id,
    r.repository_id,
    r.repo_ref,
    r.credential_ref;

COMMIT;
```

SQL 검증은 저장된 ciphertext를 현재 key로 복호화할 수 있는지 확인하지 못한다. canary
gateway의 credentialed probe와 poll worker 결과를 함께 확인한다. worker log에서는
`github_poll_db_credential_not_readable`, `github_poll_token_ref_not_found`, GitHub access
denied 또는 rate limit 오류가 없어야 한다.

## 긴급 rollback

동작을 되돌리는 최소 지점은
`src/services/gitops/github-poll-worker/poller.py`의 `GitHubPoller._github_token()`이다.
다음 분기를 제거하면 credential ref가 비어 있는 DB target도 다시 process-wide
`self.token_ref` 또는 `self.token`으로 fall through한다.

```python
if target.database_managed:
    return ""
```

`PUBLIC_GITHUB_CREDENTIAL_REF` 처리는 그대로 유지할 수 있다. 이 rollback은 workspace와
repository 경계가 없는 공유 credential을 다시 사용하게 하므로 긴급 임시 복구로만
허용한다. incident와 영향 repository를 기록하고 scoped credential 연결을 마친 뒤
차단 분기를 다시 적용한다.

## 잠재적으로 오염된 `application.manage` grant 감사

과거 application upsert가 기존 application을 수정한 사용자에게도 자동으로
`cluster_steward`를 부여할 수 있었다. 이 role은 기본 policy에서
`application.manage`를 포함한다. 다음 query는 workspace-specific role policy가 있으면
그 policy를, 없으면 `__global__` policy를 사용하는 현재 fallback 규칙까지 반영해 현재
효력이 있는 후보를 나열한다.

grant schema에는 `granted_by`, source, correlation ID가 없다. 따라서 정상 최초 생성자와
오염된 grant를 SQL만으로 확정할 수 없다. 결과를 자동 disable 또는 delete하지 말고,
application 생성자 기록, gateway access log, 변경 티켓, 실제 owner roster와 대조한다.

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

WITH steward_manage_grants AS (
    SELECT
        ra.organization_id AS workspace_id,
        ra.resource_assignment_id,
        ra.group_id,
        ra.resource_id AS application_id,
        mrr.id AS grant_id,
        mrr.user_id,
        ua.email,
        ua.role AS service_role,
        mrr.role AS resource_role,
        a.repository_id,
        a.name AS application_name,
        a.created_at AS application_created_at,
        a.updated_at AS application_updated_at,
        ra.created_at AS assignment_created_at,
        mrr.created_at AS grant_created_at,
        mrr.updated_at AS grant_updated_at,
        count(*) OVER (
            PARTITION BY ra.organization_id, ra.resource_id
        ) AS active_steward_count
    FROM resource_assignments AS ra
    JOIN member_resource_roles AS mrr
      ON mrr.resource_assignment_id = ra.resource_assignment_id
    JOIN organization_members AS om
      ON om.organization_id = ra.organization_id
     AND om.user_id = mrr.user_id
     AND om.status = 'active'
    JOIN group_members AS gm
      ON gm.group_id = ra.group_id
     AND gm.user_id = mrr.user_id
     AND gm.status = 'active'
    LEFT JOIN user_accounts AS ua
      ON ua.user_id = mrr.user_id
    LEFT JOIN applications AS a
      ON a.workspace_id = ra.organization_id
     AND a.application_id = ra.resource_id
    JOIN role_permissions AS rp
      ON rp.organization_id = CASE
            WHEN EXISTS (
                SELECT 1
                FROM role_permissions AS scoped
                WHERE scoped.organization_id = ra.organization_id
                  AND scoped.resource_type = ra.resource_type
                  AND scoped.role = mrr.role
            )
            THEN ra.organization_id
            ELSE '__global__'
         END
     AND rp.resource_type = ra.resource_type
     AND rp.role = mrr.role
     AND rp.permission = 'application.manage'
     AND rp.status = 'active'
    WHERE ra.resource_type = 'application'
      AND ra.status = 'active'
      AND mrr.status = 'active'
      AND mrr.role = 'cluster_steward'
)
SELECT
    *,
    (grant_created_at > application_created_at + interval '5 minutes')
        AS created_after_initial_window,
    (
        grant_updated_at > grant_created_at + interval '1 second'
        AND abs(extract(epoch FROM (grant_updated_at - application_updated_at))) <= 300
    ) AS role_refreshed_near_application_update
FROM steward_manage_grants
ORDER BY
    workspace_id,
    application_id,
    grant_created_at,
    user_id;

ROLLBACK;
```

`created_after_initial_window`, `role_refreshed_near_application_update`, 여러 active steward,
application이 없는 assignment를 우선 조사한다. 두 boolean은 triage 신호일 뿐 오염의
증명이 아니다.

## legacy URL, SSH, `.git` repository row 감사

현재 canonical identity는 lowercase `owner/repo`다. 다음 query는 URL, SSH,
`github.com/` prefix, `.git`, 주변 공백, mixed case, 지원하지 않는 host, canonical
충돌을 함께 찾고 각 row를 참조하는 application, binding, watch target 수도 보여준다.

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

WITH raw_rows AS (
    SELECT
        r.*,
        btrim(r.repo_ref) AS trimmed_ref,
        CASE
            WHEN btrim(r.repo_ref) ~* '^git@github[.]com:'
                THEN regexp_replace(
                    btrim(r.repo_ref),
                    '^git@github[.]com:',
                    '',
                    'i'
                )
            WHEN btrim(r.repo_ref) ~*
                 '^[a-z][a-z0-9+.-]*://github[.]com/'
                THEN regexp_replace(
                    btrim(r.repo_ref),
                    '^[a-z][a-z0-9+.-]*://github[.]com/',
                    '',
                    'i'
                )
            WHEN btrim(r.repo_ref) ~* '^github[.]com/'
                THEN regexp_replace(
                    btrim(r.repo_ref),
                    '^github[.]com/',
                    '',
                    'i'
                )
            ELSE btrim(r.repo_ref)
        END AS pathish,
        (
            btrim(r.repo_ref) ~* '^git@github[.]com:'
            OR btrim(r.repo_ref) ~*
               '^[a-z][a-z0-9+.-]*://github[.]com/'
            OR btrim(r.repo_ref) ~* '^github[.]com/'
        ) AS hosted_form
    FROM git_repositories AS r
    WHERE r.provider = 'github'
),
clean_paths AS (
    SELECT
        *,
        btrim(
            regexp_replace(pathish, '[?#].*$', ''),
            '/'
        ) AS clean_path
    FROM raw_rows
),
owner_repo AS (
    SELECT
        *,
        CASE
            WHEN hosted_form THEN
                split_part(clean_path, '/', 1)
                || '/'
                || split_part(clean_path, '/', 2)
            ELSE clean_path
        END AS owner_repo_guess
    FROM clean_paths
),
normalized AS (
    SELECT
        *,
        lower(
            regexp_replace(owner_repo_guess, '[.]git$', '', 'i')
        ) AS canonical_guess
    FROM owner_repo
),
with_collisions AS (
    SELECT
        *,
        count(*) OVER (
            PARTITION BY workspace_id, canonical_guess
        ) AS canonical_collision_count
    FROM normalized
)
SELECT
    workspace_id,
    repository_id,
    repo_ref,
    canonical_guess,
    credential_ref,
    canonical_collision_count,
    array_remove(
        ARRAY[
            CASE
                WHEN repo_ref <> btrim(repo_ref)
                    THEN 'surrounding_whitespace'
            END,
            CASE
                WHEN trimmed_ref ~* '^git@'
                    THEN 'ssh_form'
            END,
            CASE
                WHEN trimmed_ref ~*
                     '^[a-z][a-z0-9+.-]*://'
                    THEN 'url_form'
            END,
            CASE
                WHEN trimmed_ref ~* '^github[.]com/'
                    THEN 'github_host_prefix'
            END,
            CASE
                WHEN trimmed_ref ~* '[.]git/?$'
                    THEN 'dot_git_suffix'
            END,
            CASE
                WHEN trimmed_ref ~ '/$'
                    THEN 'trailing_slash'
            END,
            CASE
                WHEN owner_repo_guess <> lower(owner_repo_guess)
                    THEN 'mixed_case'
            END,
            CASE
                WHEN (
                    trimmed_ref ~* '^git@'
                    AND trimmed_ref !~* '^git@github[.]com:'
                ) OR (
                    trimmed_ref ~*
                    '^[a-z][a-z0-9+.-]*://'
                    AND trimmed_ref !~*
                    '^[a-z][a-z0-9+.-]*://github[.]com/'
                )
                    THEN 'unsupported_host'
            END,
            CASE
                WHEN canonical_guess !~
                     '^[a-z0-9_.-]{1,100}/[a-z0-9_.-]{1,100}$'
                    THEN 'invalid_canonical_shape'
            END,
            CASE
                WHEN canonical_collision_count > 1
                    THEN 'canonical_collision'
            END
        ],
        NULL
    ) AS audit_flags,
    (
        SELECT count(*)
        FROM applications AS a
        WHERE a.workspace_id = with_collisions.workspace_id
          AND a.repository_id = with_collisions.repository_id
    ) AS application_count,
    (
        SELECT count(*)
        FROM deployment_bindings AS b
        WHERE b.workspace_id = with_collisions.workspace_id
          AND b.repository_id = with_collisions.repository_id
    ) AS binding_count,
    (
        SELECT count(*)
        FROM git_watch_targets AS w
        WHERE w.workspace_id = with_collisions.workspace_id
          AND w.repository_id = with_collisions.repository_id
    ) AS watch_target_count
FROM with_collisions
WHERE repo_ref IS DISTINCT FROM canonical_guess
   OR canonical_collision_count > 1
   OR canonical_guess !~
      '^[a-z0-9_.-]{1,100}/[a-z0-9_.-]{1,100}$'
ORDER BY workspace_id, canonical_guess, repository_id;

ROLLBACK;
```

`canonical_collision_count > 1`이면 일괄 UPDATE하지 않는다. `applications`,
`deployment_bindings`, `git_watch_targets`의 `repository_id`는 GitRepository FK가 아닌
text이므로 dependent row, credential scope, resource grant를 함께 검토해 수동 병합해야
한다. legacy URL 또는 SSH row가 남은 상태에서 `/repos/validate`를 호출하면 endpoint가
기존 row를 찾지 못해 새 canonical repository ID용 credential을 만들 수 있으므로 이
감사가 credential 등록보다 먼저다.

## 완료 조건

머지와 poll worker rollout은 다음 조건을 모두 만족할 때만 진행한다.

- 모든 `declared_private`와 private으로 확인된 `visibility_unknown` target에 repository
  scoped credential이 연결돼 있다.
- credential 검증 query가 해당 target마다 `sql_shape_ok`를 반환한다.
- canary가 동일한 encryption key로 credential을 복호화하고 GitHub commit을 읽는다.
- access 오류와 credential 관련 warning이 없다.
- legacy identity collision과 의심스러운 `application.manage` grant가 변경 티켓에
  owner, 판정, 후속 조치와 함께 기록돼 있다.
- rollback 담당자와 poll worker 이전 image digest가 준비돼 있다.
