# 가인 인수인계 — Raw Evidence cluster 권한 연결

이 문서는 RCA 작업 파일에서 필요한 변경만 설명한다. 저장소·SQL·관리자 처리의 내부 구현은 이미
RCA 밖에서 완료되어 있으므로 가인 작업에서는 알 필요가 없다.

## 병합 후 해야 할 변경

대상은 `src/domains/rca/query_router.py`의 raw evidence endpoint 3개다.

1. import를 한 줄 추가한다.

   ```python
   from domains.evidence.dependencies import get_authorized_evidence_query
   ```

2. 아래 세 endpoint의 `db` dependency만 교체한다.

   - `list_evidence`
   - `list_evidence_windows`
   - `get_evidence_window_payload`

   ```python
   # 변경 전
   db: Any = Depends(get_db)

   # 변경 후
   db: Any = Depends(get_authorized_evidence_query)
   ```

endpoint 본문과 기존 저장소 호출은 바꾸지 않는다. 어댑터가 현재 호출 이름과 인자를 그대로 제공한다.

- `list_evidence_records(workspace_id, ...)`
- `list_evidence_windows_for_workspace(workspace_id, ...)`
- `get_evidence_window_payload_for_workspace(workspace_id, evidence_key)`

`current: Any = Depends(require_session)`도 그대로 둔다. FastAPI가 같은 request의 session dependency를
캐시하므로 중복 인증 조회는 발생하지 않는다.

## 바뀌는 동작

- workspace는 session의 `current.workspace_id`와 일치해야 한다.
- 해당 사용자의 `evidence.read` 권한이 있는 cluster만 조회한다.
- 권한이 없거나 권한 결과가 비어 있으면 DB를 조회하지 않고 목록은 `[]`, 단건은 `None`으로 닫힌다.
- 다른 workspace를 전달해도 동일하게 결과가 없으며 raw payload를 읽지 않는다.

이 dependency 교체 전까지 기존 raw evidence HTTP endpoint는 여전히 workspace-only 조회다. 따라서 RCA
브랜치 병합 시 위 세 줄을 누락하면 안 된다.

## 병합 직후 확인

`tests/test_evidence_query_api.py`의 `QueryApiDb`도 production dependency와 같은 표면으로 갱신해야 한다.

- `accessible_resource_ids(...)`가 테스트 사용자의 허용 cluster ID를 반환한다.
- `list_evidence(...)`, `list_evidence_windows(...)`, `get_evidence(...)`를 구현한다.
- 기존 fixture row에는 실제 허용 cluster와 일치하는 `cluster_id`를 넣는다.
- `cluster-1`만 허용된 사용자가 `cluster-2` raw evidence를 조회하면 목록 제외/단건 404가 되는 API
  negative test를 추가한다.

legacy 메서드만 가진 fake DB는 adapter에서 권한 정보를 얻을 수 없어 의도대로 fail-closed 된다. 따라서
fake를 갱신하지 않으면 기존 happy-path 테스트가 빈 목록/404로 실패한다.

```bash
uv run pytest -q \
  tests/test_evidence_tenant_boundaries.py \
  tests/test_evidence_query_api.py
```

특히 같은 workspace에서 `cluster-1` 권한만 가진 사용자가 `cluster-2` evidence key를 조회했을 때
목록에서 제외되고 단건 조회가 404로 끝나는지 확인한다.
