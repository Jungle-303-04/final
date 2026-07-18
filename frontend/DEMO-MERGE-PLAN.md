# [폐기됨] 데모 → 제품(dev) 병합 계획

> **이 문서는 폐기(superseded)되었다. 유일한 결정 문서는 `OPSIA-MASTER-SPEC.md`다.**
> 본 문서의 유효 내용(이식 순서·어댑터 매핑·토큰 목록)은 Master Spec 3장(결정표)·4장(토큰 매핑)·7장(페이즈)에 전부 흡수되었다.
> 아래 원문은 이력 참고용으로만 보존하며, 작업 근거로 인용하지 않는다.

demo/motion-animations 브랜치의 통합 셸(`devpreview-unified`)을 dev 브랜치 제품 코드로 이식하기 위한 계획.
데모는 시각·상호작용의 확정본이고, 코드는 제품 규칙(tokens·i18n·가드)에 맞춰 다시 쓴다. 파일 복사 금지.

## 1. 이식 순서 (의존 역순)

| 순서 | 대상 | 데모 원본 | 제품 위치 | 비고 |
|---|---|---|---|---|
| ① | 드릴 맵 (클러스터→노드→파드) | `devpreview-opsia.tsx` | `pages/resources` 신규 서피스 | 상태 요약 줄·강도 램프 타일·렌즈 포함 |
| ② | 종류 표 + 탐색 패널 | `devpreview-unified.tsx` SPEC/KindIndex | `features/resources` | kubectl 표준 컬럼 유지, 스코프 필터 |
| ③ | 상세 오버레이 | `devpreview-unified.tsx` DetailOverlay | `features/workload-detail` 확장 | YAML 편집·diff·재시작·관련 리소스 이동 |
| ④ | 알림 (벨·토스트) | 〃 | `features/alerts` 계약 연결 | 위험/경고/정보 3단 |
| ⑤ | AI 도킹 | `devpreview-ai.tsx` | `app/AiAssistantPanel.tsx` 재구성 | 코덱스 트랙과 합류 |
| ⑥ | 연결 위저드 | `devpreview-connect.tsx` | `pages/clusters` + GitOps 온보딩 | 코덱스 트랙과 합류 |
| ⑦ | 토폴로지 서피스 | `devpreview-topology.tsx` | `pages/traffic` 또는 신규 | @xyflow/react 전환 검토 |

## 2. 목데이터 → 실제 어댑터 매핑

| 데모 함수 | 제품 데이터 소스 |
|---|---|
| `podInventory()` / `nodeInventory()` / `repoInventory()` | `features/clusters`·`features/resources` 어댑터 (list watch) |
| `SPEC[kind].rows()` | 종류별 list API + kubectl printer 컬럼 매핑 |
| `clusterOf()` / `nsFor()` | 실데이터 메타에서 직접 — 제거 |
| YAML 생성 템플릿 | GET resource → 서버 YAML, 편집 저장 = apply |
| 상세 이벤트/로그 | `resource-timeline`·`log-stream` 계약 |
| 알림 파생 | `features/alerts` 계약 (임계 파드·노드 상태·GitOps sync) |

## 3. 게이트 대응

- **디자인 가드**: 데모의 인라인 hex → `styles/tokens.css` 토큰으로 전량 치환. 필요한 신규 토큰:
  `--accent(#0A84FF)` `--ok(#30D158)` `--warn(#FFB340)` `--crit(#FF5F55)` `--ink/-2/-3` `--hairline(#E9EAEE)`
- **모션**: 스프링 값(SOFT·PAGE)을 `motion/tokens.css`로 승격.
- **i18n 가드**: 데모의 한국어 카피를 `shared/i18n` 리소스로 등록 후 참조. 리터럴 직접 사용 금지.
- **커밋 게이트**: `<type>: 명사 키워드 / 명사 키워드` — `scripts/commit-msg-gate.sh` 로컬 훅 권장.
- 완료 조건: `npm run check` (typecheck + eslint 0 warning + vitest + design guard + bundle).

## 4. 타이포 리뉴얼 — 애플 스타일 (데모에 선적용됨)

가독성 원칙: 한 단계 큰 사이즈, 라이트 웨이트 상향(500→600), 계층은 유지.

| 토큰 | px | 용도 |
|---|---|---|
| `--text-caption` | 11 | 보조 라벨·칩 |
| `--text-label` | 12 | 표 보조 셀·서브텍스트 |
| `--text-body` | 13 | 표 본문·목록 |
| `--text-body-strong` | 14 | 행 이름·강조 본문 |
| `--text-title-3` | 15.5 | 카드 제목 |
| `--text-title-2` | 17 | 섹션 제목 |
| `--text-title-1` | 21 | 서피스 제목 |
| 웨이트 | 400/600/700/800 | 500 사용 금지(600으로) |

## 5. 병합 후 정리

- `devpreview-*.tsx`·`devpreview-*.html`·`devpreview-index.html` 삭제 (배선 완료 시점)
- `features/filters/devpreviewDeepLinks.ts` → 제품 라우터 쿼리 파라미터로 대체
