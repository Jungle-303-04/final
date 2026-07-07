# 07. 구현 계획 — Fable5 원패스 빌드

[← 문서 지도](README.md)

Claude(Fable5)가 이 문서 세트만으로 `frontend/`를 한 번에 구현하기 위한 순서와 게이트.
원칙: **각 단계는 이전 단계 산출물만 의존, 단계 말미마다 게이트 통과 후 커밋**(최소 단위 커밋 유지).

## 사전 조건

1. Node 22+, 백엔드 로컬 기동(로컬 vite dev/preview 는 `/api` proxy 로 Gateway에 연결)
2. `GET {BASE_URL}/openapi.json` 접근 가능 — 코드젠 입력
3. 이 문서 세트 링크 무결성 통과(`bash scripts/fd-link-check.sh` — 아래 정의)

## 단계 (S0~S8, 각 단계 = 커밋 1~3개)

| 단계 | 산출물 | 의존 문서 | 게이트 |
|---|---|---|---|
| S0 스캐폴드 | Vite+TS+eslint+prettier+vitest, 폴더 골격, tsconfig paths | [03](03-architecture.md) | `tsc --noEmit` 통과, 빈 앱 렌더 |
| S1 토큰·프리미티브 | tokens.css, shared/ui 인벤토리 전부(스토리 없는 단순 구현), shared/motion 5종, status.ts | [04](04-design-system.md) | ui 단위 테스트(각 컴포넌트 스모크 렌더), reduced-motion 폴백 테스트 |
| S2 데이터 계층 | openapi 코드젠, api.ts(에러 정규화·401 인터셉터), query.ts, live.ts | [03](03-architecture.md), [06](06-api-map.md) | API 에러·401 핸들러 단위 테스트, 코드젠 산출물 커밋 |
| S3 쉘·인증 | AppShell(Sidebar/Topbar/팔레트), guards, /login·/signup·/pending·/verify-email | [05](05-routes-ia.md), [views/auth](views/auth.md) | Playwright: 로그인→/overview 리다이렉트(테스트 백엔드 세션) |
| S4 플릿·클러스터 | fleet-heatmap(3레벨), ClusterList/Detail(7탭), PodDrawer, 위저드(클러스터) | [views/fleet-heatmap](views/fleet-heatmap.md), [views/cluster-detail](views/cluster-detail.md), [views/resources](views/resources.md) | 탭·드릴다운 딥링크 e2e, 5000행 렌더 성능 확인 |
| S5 레포·워크플로우 | RepoList/Detail(4탭), WorkflowList/Graph, ApprovalCard(공유 1개) | [views/repo](views/repo.md), [views/workflow](views/workflow.md) | 승인 카드 공유 검증(임포트 경로 1개), 활성 run 10s/비활성 30s 폴링 전환 테스트 |
| S6 AI·메트릭 | ChatList/ChatView(카드 3종), MetricsView(실시간+쿼리 카드) | [views/ai-chat](views/ai-chat.md), [views/metrics](views/metrics.md) | 폴링 간격 파생 테스트, ActionSelectCard 잠금 테스트 |
| S7 조직·알림·설정 | org-admin 3화면(mock), AccessPanel, Notifications+벨, OpsView | [views/org-admin](views/org-admin.md), [views/notifications](views/notifications.md) | mock↔real 어댑터 경계 테스트, 벨 배지=미읽음 일치 테스트 |
| S8 마감 | 커맨드 팔레트 액션 연결, 빈상태/에러 전수 점검, e2e smoke 풀런 | [05](05-routes-ia.md) | 아래 최종 게이트 전부 |

## 최종 게이트 (Definition of Done)

```bash
cd frontend
npm run typecheck     # tsc --noEmit 0 오류
npm run lint          # eslint 0 오류
npm run test          # vitest 전부 통과
npm run build         # 프로덕션 번들 성공, 초기 청크 < 350KB gzip(코드 스플릿: 뷰 lazy)
npm run e2e:smoke     # Playwright: 로그인→fleet→클러스터→AI 1왕복 (mock)
```

추가 수동 점검표:

- [ ] [01](01-requirements.md) R1~R11 이 각 뷰 AC 와 함께 전부 체크됨
- [ ] 원격 API 사용처 전부 `shared/lib/api.ts` 경유(직접 fetch grep 0건)
- [ ] hex 색상 grep 0건(토큰 변수만), 인라인 animate grep 0건(프리미티브만)
- [ ] features 간 import 0건(eslint boundary 규칙으로 강제)

## 문서 무결성 자동 검사 (저장소 CI 에 추가)

`scripts/fd-link-check.sh` — docs/fd 안의 상대 링크 파일 존재 검사:

```bash
#!/usr/bin/env bash
# docs/fd 마크다운 상대 링크 무결성 검사
set -euo pipefail
cd "$(dirname "$0")/.."
status=0
while IFS=: read -r file link; do
  target="${link%%#*}"
  [ -z "$target" ] && continue
  if [ ! -e "$(dirname "$file")/$target" ]; then
    echo "깨진 링크: $file → $link"; status=1
  fi
done < <(grep -RoE '\]\((\.\./|\./)?[A-Za-z0-9/._-]+\.md(#[^)]*)?\)' docs/fd \
  | sed -E 's/\]\(([^)]*)\)/:\1/')
exit "$status"
```

## 리스크와 회피

| 리스크 | 회피 |
|---|---|
| openapi 스키마와 문서 표 불일치 | 코드젠 타입이 항상 우선. 문서 표는 경로·용도만 서술(스키마 중복 서술 금지 규칙 유지) |
| WS 스키마 드리프트 | live.ts 의 zod 가드가 미스매치 시 콘솔 경고 + 해당 필드 무시(화면 불능화 금지) |
| 히트맵 성능 | 팟 레벨 타일 상한 400, 초과 시 "상위 N + 기타" 타일 병합 |
| 폴링 과다 | queryKey 공유로 화면 간 중복 폴링 통합(이미 [notifications](views/notifications.md) 설계에 반영) |
| 남은 갭 지연 | P1이던 G1·G2·G3·G5·G10은 real route 반영 완료. 남은 P2/P3는 화면에서 후보 기능으로 분리 |

## 백엔드 병행 작업 (백엔드 팀 전달용)

우선순위 순: G9(중) → G4·G6·G7(후순위) → G8(선택) → G11(편집 편의).
계약은 [06-api-map.md § 갭 상태 표](06-api-map.md#갭-상태-표)가 정본 —
구현 시 StrictModel + 라우트 상수(routes.py) + Bruno 요청 추가 관례를 따른다.
