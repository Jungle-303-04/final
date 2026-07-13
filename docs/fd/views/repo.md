# 뷰: 레포

[← 지도](../README.md) · 요구사항 [R7](../01-requirements.md#r7-레포뷰) · 생성은 [resources § 레포 연결](resources.md#레포-연결-위저드)

application = 레포+워치타깃+바인딩의 사용자 단위. 참조: 외부 기준 콘솔의 CD>Repositories/Services.

## 목록 — RepoListView (/repos)

ResourceTable: 앱 이름, repo_ref(owner/name + 브랜치), 대상 클러스터, 최근 run 상태 Badge,
마지막 배포 시각. 데이터: `GET /applications` (30s).
행 클릭 → 상세. 빈 상태 → [레포 연결] 위저드.

## 상세 — RepoDetailView (/repos/:applicationId)

```text
┌ 헤더: 앱 이름 · repo_ref ↗(GitHub 링크) · 브랜치 · [GitHub에서 열기] ┐
│ 최근 run 요약 스트립: 상태 Badge · commit sha · 경과시간              │
├ Tabs: runs | deployments | safe-pr | settings ────────────────────────┤
```

데이터: `GET /applications/{application_id}`.

### runs 탭

`GET /applications/{id}/runs` (10s 폴링 — 활성 run 있을 때만, 아니면 60s).

- 타임라인 리스트: 각 run = commit sha(모노), 상태 Badge(status.ts 매핑), 단계 진행 미니바(9단계 중 현재), 시작/경과
- run 클릭 → [workflow 그래프 뷰](workflow.md#그래프--workflowgraphview-workflowsrunid) 딥링크
- WAITING_FOR_APPROVAL run: 인라인 승인 카드 — [승인](../06-api-map.md) `POST /approvals/{id}/grant` / [거절] reject (deploy 권한 가드)
- 승인 대기 run 의 DIFFING step 에 `changes[]`가 있으면 승인 카드 아래에 필드 단위 변경 미리보기를 보여준다. 이 값은 `GET /applications/{id}/runs` 응답의 `steps[].details.changes`에서 온다.
- 승인 대기 run 의 [AI 설명]은 `/ai?prefill=...&context=...`로 이동한다. context에는 `diff_source=gitops`, `workflow_run_id`, `approval_id`, `application_id`만 넣고, 전체 diff/YAML은 넣지 않는다.

### deployments 탭

`GET /applications/{id}/deployments` — 바인딩 목록: 클러스터, ns, 이미지, replicas, 상태.
[클러스터에서 보기] → [cluster-detail workloads](cluster-detail.md#탭-명세-전부-resourcetable--entitydrawer-패턴--신규-컴포넌트-없음).

### safe-pr 탭

run payload 중 safe_pr.* 이벤트 산출물 표시(runs 응답에 포함되는 단계 데이터 사용).

- Safe PR 카드: 상태(requested/patch_prepared/ready/created/failed), PR 링크 ↗(created 시), diff 설명(ai-diff-worker 의 diff.explained 텍스트)
- DiffView: desired vs actual (diff payload)
- [AI 설명] 또는 실패 시 [AI에게 원인 묻기] → [ai-chat](ai-chat.md) 프리필. context에는 `diff_source=safe_pr`, `workflow_run_id`, `application_id`만 넣고, Chat AI는 `safe_pr.patch_prepared`/`diff.explained` 이벤트가 있을 때만 설명한다.

### settings 탭

KeyValue: manifest_path, watch 간격, binding 정보 + 권한 탭(AccessPanel 재사용, [resources § 권한](resources.md#권한-탭-accessview-g5)).
"첫 커밋 감지 대기" 상태(등록 직후 run 0건): EmptyState(info) — [resources 위저드](resources.md#레포-연결-위저드) 주의 문단과 정합.

## AC

- [ ] 활성 run 존재 시에만 10s 폴링(불필요 트래픽 방지) — useQuery enabled/interval 파생
- [ ] 승인/거절 후 run 상태가 다음 폴링에서 진행 단계로 이동(회귀 차단은 백엔드 rank 가드)
- [ ] safe-pr 탭이 데이터 없는 run 에서 EmptyState("이 run 은 Safe PR 경로가 아닙니다")
- [ ] GitHub 외부 링크는 GITHUB_WEB_BASE 유도 규칙과 동일한 owner/name 조립
