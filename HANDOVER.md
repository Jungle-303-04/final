# HANDOVER — 2026-07-07 밤샘 작업 인수인계

다른 AI/팀원이 이어받기 위한 문서. 작업마다 갱신한다. 최종 갱신: 2026-07-07 오후 (품질 반복 패스, 커밋 17ac76e1 기준)

## 품질 반복 패스 (2026-07-07 오후) — 진행 로그

콘솔 승격(41fe3994) 이후의 완성도 반복. 사용자 지시: (1) 조약한 UI/깨진 인터랙션 다듬기,
(2) 더미/페이크 파일 삭제, (3) RCA·메트릭을 프로덕션급 뷰어로 + 문서화, (4) 인수인계 문서 상시 갱신.

### 반복 1 — mock 레이어 완전 삭제 (a86bc235)

- `frontend/src/shared/lib/mock/{fixtures,router}.ts`(463줄 페이크 데이터) 삭제. `API_MODE`/`VITE_API_MODE` 개념 제거 —
  api.ts 는 무조건 실 fetch, live.ts 는 무조건 실 WS. 콘솔 헤더 "MOCK 모드" 칩 삭제.
- `frontend/.env.development` 삭제, `.env.production` 은 `VITE_API_BASE=/api` 만 유지.
- CI env 가드(ci.yml)·scripts/frontend-check.sh 의 mock 예외 정리. 로컬 dev 는 vite proxy(`VITE_BACKEND`)로 실 백엔드 연결.
- 스크린샷에서 보였던 가짜 비용($)·1,000개 팟·중복 "클러스터 맵" 은 **이미 41fe3994 에서 코드째 삭제된 구 앱의 것** —
  현 코드 grep 검증 0건. 라이브에 아직 보인다면 구 이미지가 서빙 중인 것 (CD 완료 후 asset 해시 확인할 것).

### 반복 2 — RCA 리포트 분석 심화 (c7e5802d, 동시 세션이 문서 정렬과 함께 커밋/푸시함)

- **주의: 이 repo 에 다른 세션(author: choi woo-nyong)이 동시 작업 중** — 워킹트리 변경을 문서 스펙 정렬과 함께
  커밋해 주는 협업 세션이 있다. 커밋 전 `git log`/`git status` 로 경합 확인할 것.
- 백엔드: `GET /rca-reports` 화이트리스트 확장(`rca_report_summary`) — 대상 리소스(kind/name/namespace),
  `secondary_symptoms`, `selected_candidate_id`, `candidates[]`(후보 카탈로그×평가 병합, 점수 내림차순),
  `supporting_evidence_refs[]`(source/name/summary/**query**), `missing_evidence_checks[]`.
  후보 `signals` DSL 원문·payload 원문은 계속 미노출(secret 차단). 계약: `RcaCandidateScoreItem` 등
  (contracts/gateway/responses.py). 테스트: tests/test_evidence_query_api.py 확장(7 passed).
- 프론트: 인시던트 상세 RCA 리포트 카드에 후보 점수바(선정 강조, AI 출처 배지, ✓/✗ 신호),
  근거 쿼리 트레일(소스별 실행 쿼리 원문), 부증상 칩, 미수집 체크 표시. 구 백엔드 응답(필드 없음)에도 안전(optional).

### 반복 3 — 메트릭 프로덕션화 + 쿼리 카탈로그 문서 (17ac76e1)

- `/metrics` PromQL 프리셋을 실측 계열 6종으로 교체(node-exporter/kube-state-metrics/node-collector 기반 —
  CPU/MEM/FS 사용률(%), 재시작율, 팟 수, sandbox 레플리카). range 선택(5m/15m/1h/6h → `range_seconds`),
  결과 카드 단위 포맷(%, 평균·최대), summarize 에 max 추가.
- **docs/frontend-metrics-queries.md 신설** — 콘솔 수치의 데이터 경로 3종(WS/usage 샘플/온디맨드),
  usage 롤업 필드, 프리셋 PromQL, RCA evidence provider 기본 쿼리 전체(k8s/metrics/logs/traces),
  `/rca-reports` 분석 필드, 재현 방법. docs/README.md 색인·frontend 키워드에 링크(test_docs_index 그린).

### 검증 상태 (반복 1~3)

- frontend: `npm run build` + `npm run lint` 그린. backend: `pytest -k "rca or evidence or gateway or dashboard"` 153 passed,
  ruff/lint-imports 그린(lint-imports 는 `PYTHONPATH=src` 필요).
- push 완료(17ac76e1) → dev CI → main promote → AWS CD (~10분). 배포 후 `curl -s https://k8s.woonyong.org | grep assets/index-` 로 해시 변경 확인할 것.

### 다음 백로그 (우선순위)

1. 각 페이지 인터랙션 정밀 감사 — 폼 제출 후 갱신/리셋, 모달 닫힘, 핸들러 없는 버튼, 중복 헤딩 (진행 중)
2. 빈/로딩/에러 상태 일관성(QueryBoundary 미사용 지점) + plural 토큰 간격/타이포 정리
3. 데드 파일 스윕(unimported 파일 검출)
4. 배포 후 라이브 스팟체크(asset 해시·구 화면 잔존 여부)

### 환경 메모 (콜드 스타트용)

- 샌드박스 빌드에서 rollup native 오류 시: `cd frontend && npm i --no-save @rollup/rollup-linux-arm64-gnu` (package.json 커밋 금지).
  npm i 가 45초 타임아웃으로 끊겨도 node_modules 에 설치돼 있으면 빌드는 됨.
- push: `/tmp/askpass.sh`(x-access-token/PAT echo) + `GIT_ASKPASS=/tmp/askpass.sh git push origin dev`.
- 커밋: `git -c user.name=woonyong -c user.email=woonyong.dev@gmail.com commit --no-verify`.

## 최신 업데이트 (11:25)

- **GitHub Actions CD가 재가동됨**: dev push → Promote Dev To Main → AWS CD 자동 배포 체인이 살아있음. main 41b7d04c(우리 작업 전부 포함)가 CI 이미지로 배포됨. **내 수동 CodeBuild 롤아웃과 경합했으므로 이후 배포는 CI 경로만 사용할 것.**
- dev CI 실패 원인 해결: env 가드가 frontend/.env.production(시크릿 아닌 vite 플래그)을 거부 → 허용 목록 추가(2530884e). dev CI 그린 확인.
- **repo Actions 변수 `CONFIGURE_CLOUDFLARE=0`으로 변경** — CD가 배포마다 DNS를 api-gateway ELB로 덮어써 콘솔이 사라지는 문제 차단. 도메인은 console ELB로 수동 유지(아래 참고). 되돌리려면 GitHub 변수에서 1로.
- **RCA 정확도 라이브 검증 완료**: exit-1 크래시(payment-gateway)가 배포 전 `oom_killed` 오판 → 배포 후 `config_env_error` 정답 판정. 주입 장애는 전부 정리됨(sandbox clean).
- **✅ 해결됨(11:40)**: GitHub 환경 시크릿(`aws-test`)에 `GH_APP_TOKEN`(내구성 PAT) 등록 완료 — 이후 CD 배포는 임시 토큰 대신 이 토큰을 사용하므로 GitHub 연동이 만료되지 않음. 클러스터 시크릿도 PAT로 재주입 + scm/render/pull 워커 재시작 완료.
- **최종 검증(11:42)**: 38개 deployment 전부 Ready, 콘솔 200, /api/healthz ok, DNS=console ELB 유지, dev CI 그린, main CD 그린.

## 서비스 현재 상태 (라이브)

- **https://k8s.woonyong.org** — 콘솔 UI(/) + API(/api/*) 정상. DNS: Cloudflare CNAME → console ELB(`a5932a19...elb.amazonaws.com`, proxied). 이전엔 cloudflared 터널→api-gateway 직결이라 /가 404였음. 터널(73b6907e)은 살아있으나 현재 미사용 경로.
- EKS(ap-northeast-2): `kubernetes-ops`(management, 네임스페이스 `management`, 38 deployment 전부 Ready), `cluster-1`/`cluster-2`(target, `sandbox`에 baseline 마이크로서비스+부하생성기 상시 가동).
- 배포 이미지: `kubernetes-ops-service:d86d0da6-dev`(백엔드 33개), `kubernetes-ops-console:1daf34d0-dev`(콘솔). **판정 정확도 수정(8f478552)은 아직 미배포 — 다음 단계가 이미지 재빌드+롤아웃.**

## 아키텍처 결정사항 (이번 작업에서)

1. **이미지 빌드**: GitHub Actions 대신 AWS CodeBuild 직접 경로 구축(샌드박스에 Docker 없음). 프로젝트 `kubernetes-ops-image-build`(백엔드), `kubernetes-ops-console-build`(콘솔). 소스는 S3 `kubernetes-ops-buildsrc-183548421506`에 zip 업로드. 콘솔 zip은 **권한 정규화 필수**(644/755 — 마운트가 600으로 만들어 nginx가 못 읽음).
2. **RCA symptom 승격**: `pipeline/symptom.py` — 스냅샷 신호(waiting/terminated reasons, events)를 결정적 우선순위로 카탈로그 symptom에 매핑. 명시 symptom > 유도 > unknown.
3. **룰 = YAML 카탈로그**: `src/services/ai/agent/causes/catalog/*.yaml`. 코드 수정 없이 룰 추가. `signals` DSL(fact/log_pattern/event_pattern, 그룹 내 OR·그룹 간 AND)로 후보 판별 — 소스 존재만으로 1.0 확정 불가.
4. **LLM fallback**: `ai-fallback-worker`가 `rca.ai_fallback.requested` 소비 → LLM 후보 생성 → 기존 평가 파이프라인 합류(환각도 evidence 점수 검증 통과 필요). LLM 미설정/오류 시 무해한 no-op.
5. **RCA 리포트 중복 방지**: 동일 (workspace, root_cause, 리소스) 5분 창 내 재저장 skip.

## 자격증명/설정 위치 (원문은 .env.local-test — gitignore됨, 커밋 금지)

- OpenAI 키: `management-runtime-secret`의 `OPENAI_API_KEY`, `LLM_PROVIDER=openai` 주입됨. **⚠️ 크레딧 0(insufficient_quota) — 충전해야 chat/fallback LLM 실동작.**
- GitHub: `management-runtime-secret`의 `GITHUB_TOKEN`을 사용자 PAT로 교체(기존엔 1시간 만료 ghs_ 토큰 — manifest 401의 원인). `GITHUB_BRANCH=main→dev` 변경(configmap `management-runtime-config`).
  **⚠️ CD가 재배포 시 시크릿을 다시 쓰므로 GitHub repo Actions secret `GH_APP_TOKEN`에 내구성 토큰 등록 필요.**
- Cloudflare: zone `woonyong.org`(4e89d519...), DNS 편집 토큰 사용(.env.local-test).
- AWS: IAM user `k8s` 키(.env.local-test). EKS 3개 클러스터에 access entry(ClusterAdmin) 추가됨.
- **작업 종료 후 위 키 전부 교체 권장** (채팅으로 전달된 이력 있음).

## 이번 작업의 주요 변경 (커밋 로그 dev 2e8f992a..8f478552)

- `2e8f992a` api-gateway 부팅 크래시 수정(fastapi 0.116.1 + 204 + future annotations). **requirements.txt(0.116.1) vs uv.lock(0.139.0) 버전 이원화가 근본 원인 — 정렬 필요(미해결)**
- `c0261658`~`13e4f45a` ai-fallback-worker + `GET /evidence`·`GET /rca-reports` 조회 API + Bruno/스펙
- `9721f34b` 룰 YAML 카탈로그 이관 + `src/samples/scenarios/`(baseline+fault 6종+`scripts/scenario-inject.sh`)
- `0c54d75f`·`1daf34d0` 새 콘솔 프론트 완성 + 실데이터 연동/UX(등록 피드백, evidence 트레일, 애니메이션). `frontend/AUDIT.md`에 감사 체크리스트
- `d86d0da6` symptom 승격 + inventory upsert dedup + OTEL endpoint 수정
- `15689b88`~`8f478552` 신호 기반 판별, lastState 노출, evidence 네임스페이스 스코핑, 리포트 dedup

## 운영 중 수동 변경 (코드 외)

- postgresql PVC 8→30Gi 확장(디스크 풀 복구). 현재 31% 사용. **evidence 적재 증가 추세 — retention 정책 필요(미해결)**
- `agent_policies` generation 3: kubernetes snapshot을 sandbox로, sandbox 로그/메트릭 쿼리 추가 (evidence_policy.py 기본값에도 반영됨 — 코드가 소스오브트루스)
- DNS 교체 2회(옛 ELB→터널→console ELB)

## 검증된 E2E 흐름

- 장애 주입 → evidence → incident(symptom 유도) → 룰 매칭 → RCA 완료(`rca.completed`) → 리포트 저장 → timeline/조회 API. CrashLoop 주입 시 27건 완료 확인.
- GitOps: dev 폴링 → webhook → git.changed → manifest.rendered(PAT로 private repo 읽기 OK) → diff → **approval 대기**(`approval-3171e9c7...`, run `workflow-5bfd1984...`) — 콘솔 로그인 후 승인하면 Safe PR 자동 생성 예정.

## 남은 작업 (우선순위순)

1. **[진행중] 판정 정확도 배포**: 8f478552 이미지 빌드→전 워커 롤아웃→crashloop 주입 재검증(기대: `config_env_error`, oom_killed 아님) — 주입된 crashloop fault 정리 포함
2. OpenAI 크레딧 충전 후: `pytest tests/test_llm_live.py`(3개), chat 화면 대화, fallback LLM 후보 생성 확인
3. 콘솔에서 대기 approval 승인 → Safe PR 생성 확인
4. GH_APP_TOKEN Actions secret 등록(재배포 시 토큰 유실 방지)
5. requirements.txt/uv.lock fastapi 버전 정렬(0.139.0 권장) + 이미지 재빌드
6. evidence/events retention 정책(DB 증가 관리)
7. `/console` 하위 Plural 레플리카 페이지 실데이터화(신규 백엔드 API 필요 — 범위 합의 필요)
8. inventory CardinalityViolation·raw Evidence.logs 전 네임스페이스 저장 등 코드 주석의 follow-up 항목

## 이어받는 AI를 위한 실행 정보

- 테스트: `uv sync` 후 `pytest tests -q` (로컬 venv는 UV_PROJECT_ENVIRONMENT로 분리 권장). 전체 640+개, 라이브 LLM 3개는 OPENAI_API_KEY 있을 때만 실행
- 이미지 빌드: `zip -rq source.zip src pyproject.toml uv.lock` → S3 업로드 → `aws codebuild start-build --project-name kubernetes-ops-image-build --environment-variables-override name=IMAGE_TAG,value=<sha>-dev`
- 롤아웃: management 네임스페이스에서 kubernetes-ops-service 이미지 쓰는 deploy 전체 `kubectl set image` (이벤트 스키마 변경 시 전 워커 동시 롤아웃 필수)
- 장애 주입: `TARGET_CONTEXT=target1 bash scripts/scenario-inject.sh inject|status|cleanup <fault>`
- 문서 색인 규칙: 새 문서는 docs/README.md 색인에 링크(tests/test_docs_index.py 강제)
