// API 계층 — 콘솔 프론트의 "유일한" 데이터 접근 지점
//
// 규칙:
//  - 페이지·위젯·맵 등 모든 UI 코드는 이 모듈에서만 데이터를 가져온다.
//    (../mock, ../metrics를 직접 import하는 것은 어댑터 내부에서만 허용)
//  - 지금은 mock 어댑터를 그대로 노출한다. 데이터 형태(타입)가 곧 API 계약이다.
//
// 백엔드 연결 방법 (frontend/docs/api-layer.md 참고):
//  1) 이 파일의 re-export를 fetch/TanStack Query 구현으로 교체한다
//     (예: getClusterAgg → GET /api/clusters/:id/metrics 응답을 ClusterAgg로 매핑)
//  2) 페이지 코드는 수정하지 않는다 — 타입이 유지되는 한 그대로 동작한다
//  3) 수집기 상태(collectorOf)는 백엔드 node-collector 헬스 엔드포인트로 대체
export * from '../mock';
export * from '../metrics';
