# 뷰: 리소스 생성과 권한 설정

[← 지도](../README.md) · 요구사항 [R4·R5](../01-requirements.md#r4-리소스-생성-레포-클러스터)

두 위저드(클러스터 등록, 레포 연결)와 권한 관리 화면. 위저드는 공용 `Stepper` + `Form`.

## 클러스터 등록 위저드 (실존 API — 테스트 전용 대역 불필요)

진입: admin 에서 /clusters [+ 클러스터 등록], / 홈 빈 상태의 등록 action.
Modal(size lg) 내 Stepper 4단계. 백엔드 흐름은 Bruno `02-target-admin` 과 동일.

| 단계 | 내용 | API |
|---|---|---|
| 1. 프로바이더 | 등록 flow 선택 + import 후보 선택. flow 가 available 이고 available 설치 방식이 하나 이상 있을 때만 다음 가능 | `GET /providers/cluster-discovery` |
| 2. 설정 | cluster_id(slug 검증), name, 설치 방식/kube context. unavailable 설치 방식은 disabled + 사유 표시 | 로컬 |
| 3. 사전 점검 | 중복 cluster_id, provider readiness, agent 상태 확인 | `POST /targets/preflight` — errors/warnings 인라인 표시 |
| 4. 발급 | 등록 실행 → install manifest + agent token 표시 | `POST /targets` |

4단계 결과 화면:

```text
✓ 등록 완료
agent token   [●●●●●● 복사]  ← 1회 노출 경고 문구
install command [curl ... | kubectl apply -f - 복사]  ← 응답에 있을 때 우선 표시
manifest      CodeBlock(yaml)  ← install command 가 있으면 수동 적용 대안
[지금 확인] → GET /clusters/{id}/connection-status
             발급 단계 진입 후 5s 자동 폴링, connected/online 이면 ok Badge
```

## 레포 연결 위저드

"레포 생성" = application(+repository/watch target/binding) 생성. 두 경로 제공:

1. **카탈로그 설치**(runner 연결 후 활성화): /catalog 에서 항목 선택 → `GET /catalog/items/{item_id}` → 파라미터 Form → `POST /catalog/items/{item_id}/installs`
2. **직접 연결**: /repos [+ 레포 연결] → Stepper 3단계
   - 1. 레포: repo_ref(`owner/name`, HTTPS URL, SSH URL)를 `POST /repositories/discovery/probe` 로 정규화/접근 확인 → `GET /repositories/discovery/branches` 로 branch select → `POST /repositories/discovery/manifests` 로 manifest 후보 select → `POST /repositories/discovery/validate` 로 render/validation 결과 표시. manifest 후보 선택값은 `source_type:path` 이므로 같은 path 의 raw/kustomize/helm 후보를 섞지 않는다.
   - 2. 배포 대상: cluster Select(`GET /clusters`). cluster 가 없으면 admin 은 /clusters 등록 링크, non-admin 은 권한 요청 안내.
   - 3. 확인: KeyValue 요약 → `POST /applications` 후 `POST /applications/{application_id}/deployments` → 성공 시 /repos/:applicationId

주의(정합성): 직접 연결의 최초 트리거는 GitHub 쪽 webhook/poller 가 담당 —
위저드는 등록까지만 하고 "첫 커밋 감지 대기" 상태를 [repo.md](repo.md) 가 표시한다.

## 권한 탭 — AccessView (G5)

`/settings/access` + 각 리소스 Drawer 의 "권한" 탭에서 재사용(같은 컴포넌트 `AccessPanel`).

```text
리소스: [cluster: target ▾]        ← 컨텍스트에 따라 고정되기도
┌ ResourceTable ───────────────────────────────┐
│ 대상(user/group Avatar) │ ResourceRole Badge │ 부여일 │ ⋮ 회수 │
└──────────────────────────────────────────────┘
[+ 권한 부여] → Modal: 대상 검색(MultiSelect, G2/G3 데이터)
               + ResourceRole Select(설명 툴팁: observer=읽기, release_operator=배포,
                 cluster_steward=위험 명령 승인)
```

| 항목 | 내용 |
|---|---|
| API | `GET /access?resource_id=...`, `POST /access`, `DELETE /access/{access_id}` — [06 §G5](../06-api-map.md#g5-리소스-접근-관리) |
| 역할 의미 | `packages/contracts/identity` 의 ResourceRole·Permission 매핑 표를 그대로 툴팁화 |
| 가드 연동 | 부여 결과는 [05 § 가드](../05-routes-ia.md#가드-appguardstsx) RequirePermission 의 데이터 소스 |

## AC

- [ ] 클러스터 위저드가 Bruno 시나리오(등록→연결 확인)와 동일 API 순서로 동작
- [ ] 클러스터 위저드가 unavailable 설치 방식을 기본 선택하지 않고 preflight 를 막음
- [ ] 레포 위저드가 probe/branch/manifest 후보/validate 순서로 실제 저장소를 확인하고, manifest 후보를 `source_type:path` 로 구분
- [ ] agent token 은 상태/스토리지에 저장하지 않음 — 화면 1회 표시 후 소멸
- [ ] target preflight 의 errors/warnings 가 해당 Step 에 인라인 매핑
- [ ] AccessPanel 이 설정 화면과 리소스 Drawer 두 곳에서 동일 컴포넌트로 렌더
- [ ] 권한 없는 사용자에게 위저드 진입 버튼이 disabled + 사유 Tooltip
