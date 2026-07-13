# API 계층

콘솔 UI의 데이터 접근은 TanStack Query hook과 `shared/lib/api.ts`로 모은다.
페이지·위젯·맵은 실제 Gateway 응답 또는 그 응답을 정규화한 adapter 값만 사용한다.

## 구조

```
페이지/위젯/맵 ──> features/*/api.ts ──> shared/lib/api.ts ──> Gateway /api/*
                              └──> shared/lib/adapt.ts (필드명·빈 값 정규화)
```

- 운영 UI는 API 실패를 조용히 대체하지 않는다. `QueryBoundary` 또는 각 화면의 error state가 실패를 드러낸다.
- 데이터 타입은 수기 타입(`shared/lib/types.ts`)과 Gateway contract 문서로 관리한다. 장기적으로 OpenAPI 코드 생성으로 전환한다.

## 백엔드 연결 기준

1. 새 화면은 먼저 실제 Gateway endpoint 또는 기존 read model이 있는지 확인한다.
2. endpoint가 없으면 백엔드 query/read model을 추가한다. 프론트에서 값을 합성하지 않는다.
3. adapter는 이름/형태 정규화와 null-safe 렌더 방어만 한다.
4. 메트릭 drilldown은 `/metrics?cluster=...&subject=...&name=...` 컨텍스트를 PromQL 템플릿에 주입하고, `POST /agent/debug/query` 결과만 표시한다.

## 불변식 (기획서 docs/map-rbac-plan.md의 I1~I12)

- I3: 모든 수치는 팟 레벨에서 생성 → 상향 합산. 비율은 Σ사용량÷Σ용량.
- I6: 플릿 집계 함수(`getFleetAgg`)는 반드시 "뷰어에게 보이는 클러스터 목록"을 인자로 받는다.
- I11: 수집기 비정상 클러스터는 값을 만들지 않는다. 빈 상태와 error state로 표시한다.
