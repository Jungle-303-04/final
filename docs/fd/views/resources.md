# 뷰: 리소스 생성과 권한 설정

[← 지도](../README.md) · 요구사항 [R4·R5](../01-requirements.md#r4-리소스-생성-레포-클러스터)

두 위저드(클러스터 등록, 레포 연결)와 권한 관리 화면. 위저드는 공용 `Stepper` + `Form`.

## 클러스터 등록 위저드 (실존 API — mock 불필요)

진입: /clusters [+ 클러스터 등록], /overview 빈 상태, 커맨드 팔레트.
Modal(size lg) 내 Stepper 4단계. 백엔드 흐름은 Bruno `02-target-admin` 과 동일.

| 단계 | 내용 | API |
|---|---|---|
| 1. 프로바이더 | 카드 그리드에서 cloud/deploy provider 조합 선택 | `GET /providers/catalog` |
| 2. 검증 | credential ref 등 입력 → 유효성 | `POST /providers/validate` — errors/warnings 인라인 표시 |
| 3. 설정 | cluster_id(slug 검증), name, environment, 관측 스택 URL 3종(기본값 채움), evidence 주기 | 로컬 |
| 4. 발급 | 등록 실행 → install manifest + agent token 표시 | `POST /targets` (apply:false) |

4단계 결과 화면:

```text
✓ 등록 완료
agent token   [●●●●●● 복사]  ← 1회 노출 경고 문구
manifest      CodeBlock(yaml, 접힘) [복사] [다운로드]
"kubectl apply -f - 로 적용하세요"
[연결 확인] → GET /clusters/{id}/connection-status 5s 폴링
              connected 되면 ok Badge + confetti 금지, CountUp 배지 전환만
```

## 레포 연결 위저드

"레포 생성" = application(+repository/watch target/binding) 생성. 두 경로 제공:

1. **카탈로그 설치**(권장): /catalog 에서 항목 선택 → `GET /catalog/items/{item_id}` → 파라미터 Form → `POST /catalog/items/{item_id}/installs`
2. **직접 연결**: /repos [+ 레포 연결] → Stepper 3단계
   - 1. 레포: repo_ref(`owner/name`), branch, manifest_path — 백엔드 `GitHubWebhookRequest` 필드와 동일 제약
   - 2. 배포 대상: cluster Select(`GET /clusters`), environment, replicas
   - 3. 확인: KeyValue 요약 → `POST /applications` → 성공 시 /repos/:applicationId

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
| API (초안) | `GET/POST /access`, `DELETE /access/{access_id}` — [06 §G5](../06-api-map.md#g5-리소스-접근-관리) |
| 역할 의미 | `packages/contracts/identity` 의 ResourceRole·Permission 매핑 표를 그대로 툴팁화 |
| 가드 연동 | 부여 결과는 [05 § 가드](../05-routes-ia.md#가드-appguardstsx) RequirePermission 의 데이터 소스 |

## AC

- [ ] 클러스터 위저드가 Bruno 시나리오(등록→연결 확인)와 동일 API 순서로 동작
- [ ] agent token 은 상태/스토리지에 저장하지 않음 — 화면 1회 표시 후 소멸
- [ ] provider validate 의 errors 가 해당 Step 필드에 인라인 매핑
- [ ] AccessPanel 이 설정 화면과 리소스 Drawer 두 곳에서 동일 컴포넌트로 렌더
- [ ] 권한 없는 사용자에게 위저드 진입 버튼이 disabled + 사유 Tooltip
