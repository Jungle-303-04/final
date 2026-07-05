# 뷰: 조직 관리 (조직·멤버·그룹)

[← 지도](../README.md) · 요구사항 [R2·R3](../01-requirements.md#r2-조직-생성--r3-조직원그룹-생성) · 갭 [G1·G2·G3](../06-api-map.md#신규-api-계약-초안)

`/settings/*` 하위, RequireAdmin. **전 API 가 갭(G1~G3)** — mock adapter 로 선행 개발(D7).
참조 UX: 외부 기준 콘솔 Settings > User Management, Backstage 조직 모델([02](../02-reference-map.md)).

## 공통 패턴

세 화면 모두 동일 골격 — `ResourceTable` + `EntityDrawer` + 생성 `Modal`. 신규 컴포넌트 불필요.

```text
┌ 제목 + [+ 생성] ──────────────────────────┐
│ SearchInput                               │
│ ResourceTable (행 클릭 → EntityDrawer)     │
└───────────────────────────────────────────┘
```

## 조직 — OrganizationsView (G1)

| 항목 | 내용 |
|---|---|
| 테이블 컬럼 | 이름, 멤버 수, 그룹 수, 생성일 |
| 생성 Modal | Form: name(필수, 3~40자), description |
| API (초안) | `GET/POST /orgs`, `GET/PATCH/DELETE /orgs/{org_id}` — [06 §G1](../06-api-map.md#g1-조직-crud) |
| Drawer 탭 | 개요(KeyValue) · 그룹 목록 · 멤버 목록 |
| 삭제 | DropdownMenu danger + 확인 Modal(이름 입력 확인) |

## 멤버 — MembersView (G3)

| 항목 | 내용 |
|---|---|
| 테이블 컬럼 | Avatar+이메일, ServiceRole Badge, 상태(활성/검증대기/**승인대기**), 소속 그룹 AvatarGroup, 가입일 |
| 승인 대기 행 | warn Badge + [승인] 버튼 → `POST /auth/users/{user_id}/approve` (**실존 API**) → Toast + invalidate |
| API (초안) | `GET /users?status=` — [06 §G3](../06-api-map.md#g3-사용자-목록) |
| Drawer | 프로필 · 소속 그룹 관리(G2 멤버십) · 보유 리소스 권한([resources § 권한](resources.md#권한-탭) 읽기 전용 요약, G5) |
| 초대 | 범위 외 (가입은 self-signup — [auth.md](auth.md)) |

## 그룹 — GroupsView (G2)

| 항목 | 내용 |
|---|---|
| 테이블 컬럼 | 이름, 소속 조직, 멤버 수, 연결 리소스 수 |
| 생성 Modal | Form: name, organization(Select — G1 데이터), description |
| API (초안) | `GET/POST /groups`, `PATCH/DELETE /groups/{group_id}`, `PUT/DELETE /groups/{group_id}/members/{user_id}` — [06 §G2](../06-api-map.md#g2-그룹-crud--멤버십) |
| Drawer 탭 | 멤버(MultiSelect 로 추가/제거) · 리소스 권한(G5 — AccessView 로 딥링크) |

## 상태·모션

- 목록 Stagger 등장, Drawer 는 radix 기본 슬라이드
- mock 모드 표시: Topbar 에 "MOCK" Badge(neutral) — VITE_MOCK_GAPS=1 일 때만
- 빈 상태: "아직 조직이 없습니다" + [첫 조직 만들기]

## AC

- [ ] 승인 대기 멤버 승인이 실존 API 로 동작(mock 아님)
- [ ] 그룹 멤버 추가/제거가 Drawer 닫지 않고 낙관적 갱신(onMutate) + 실패 롤백
- [ ] mock ↔ real 전환 시 뷰 코드 무변경(어댑터만 교체) 증명 — mock.ts 스위치 테스트
- [ ] 조직 삭제는 소속 그룹 존재 시 422 안내("그룹을 먼저 정리")— 계약 초안과 일치
