# 상용화 추진 계획 (2026-07-07)

이 문서는 dev 브랜치 기준으로 RCA 서비스를 실서비스 수준으로 끌어올리기 위한 전체 계획이다.
기획 배경: 백엔드 갭 구현 → 새 프론트를 위한 API 계약 → AWS EKS 배포 → k8s.woonyong.org 도메인 연결까지 한 번에 닫는다.
각 작업은 "완료 기준(검증 가능한 테스트/확인 명령)"을 명시하고, 기준을 통과해야 완료로 간주한다.

## 범위에서 제외하는 것

- fleet 건강 점수 그리드 / 업그레이드 현황 패널 (기존 대시보드 검증용 응답 뷰) — 사용자 결정으로 폐기. 해당 UI용 백엔드 집계 API는 만들지 않는다.
- 기존 `frontend/` SPA — 폐기 방침. 새 프론트는 별도 스레드에서 작업 중이며, 이 계획은 새 프론트가 소비할 API 계약만 책임진다. 클러스터에 떠 있는 기존 console 배포는 새 프론트 교체 전까지 유지한다.

## 현재 상태 진단 (2026-07-07 밤 기준 사실)

배포: `kubernetes-ops`(management) EKS에 전체 스택 배포됨. `cluster-1`, `cluster-2`는 target.
이미지: ECR `kubernetes-ops-service`. CI(GitHub Actions)가 main 기준으로 빌드하나, 이번 밤 작업은 AWS CodeBuild(`kubernetes-ops-image-build`)로 dev 소스를 직접 빌드한다.

발견한 운영 장애와 조치(완료):

| 장애 | 원인 | 조치 |
| --- | --- | --- |
| postgresql-0 CrashLoop 11h | PVC 8Gi 디스크 풀, WAL redo 불가 | PVC 30Gi 온라인 확장(ebs-gp3) 후 정상 복구 |
| api-gateway CrashLoop | `alert/router.py` DELETE 204 + `-> None` + future annotations가 fastapi 0.116.1에서 부팅 AssertionError. 이미지는 requirements.txt(0.116.1) 기준, uv.lock(0.139.0)과 불일치 | `response_model=None` 명시(8bcc59df), 이미지 재빌드·재배포 |
| realtime-gateway 0/1 | DB 다운 대기 | DB 복구 후 재시작으로 정상화 |
| k8s.woonyong.org 1016 | cloudflared 터널은 떠 있으나 api-gateway가 죽어 origin 응답 불가(터널-DNS 연결 상태는 배포 후 재확인) | api-gateway 복구 후 DNS/터널 라우트 점검 |

구조적 리스크(후속 작업으로 관리):

- requirements.txt와 uv.lock의 버전 이원화 — "로컬은 통과, 프로드는 크래시"의 근본 원인. 정렬 작업 필요.
- DB 8Gi를 2일 만에 채운 evidence/이벤트 적재량 — retention 정책 필요.

## 작업 항목

### 1. LLM 실연결 검증

- 내용: OpenAI 키(`.env.local-test`, gitignore됨)로 `packages/ai/llm.py` 게이트웨이 실호출, chat-worker `ConversationEngine` 경로 검증.
- 완료 기준: 실키 통합 테스트(환경변수 있을 때만 실행되는 opt-in 마커) 통과 + 배포 환경 chat-worker에 `LLM_PROVIDER=openai` 시크릿 주입 후 실응답 확인.

### 2. LLM fallback RCA 완성 (핵심 차별점)

- 현재: plan-worker가 룰 미매칭 시 `RcaAiFallbackRequestedBody` 이벤트를 발행하지만 소비자가 없어 이벤트가 죽는다.
- 설계: `ai-fallback-worker` 신설. 이벤트 소비 → evidence bundle 요약과 실제 catalog cause ID를 LLM에 구조화 프롬프트로 전달 → catalog ID hypothesis 선택 → catalog의 evidence/check/signal 계약 복원 → 기존 `rca.candidates.planned` 흐름에 합류시켜 analyze-worker의 결정론적 내용 signal 평가를 태운다. signal 미검증 hypothesis는 `insufficient_evidence`로 차단한다.
- 완료 기준: 테스트 전용 대역 LLM 단위 테스트(이벤트 in → 후보 out), 실키 opt-in 테스트, 룰 미매칭 인시던트가 backlog가 아닌 LLM 후보 경로로 RCA 완료되는 골든패스 테스트.

### 3. 범용 조회 API (새 프론트 대비)

- 추가: `GET /evidence`(workspace/correlation_id/kind/기간 필터 + 페이지네이션), `GET /rca-reports`(동일 패턴). 권한은 기존 dashboard 라우터와 동일하게 세션 + cluster read 스코프.
- 완료 기준: 라우터 테스트(권한 포함), Bruno 요청 추가, API 계약 문서(`docs/api/`)에 새 프론트가 쓸 요청/응답 스키마 명세.

### 4. RCA 룰 설정화

- 현재: `services/ai/agent/causes/catalog/*.yaml` 선언형 카탈로그와 `loader.py`가 rule을 로딩한다.
- 설계: 룰의 매칭 조건·expected_evidence·checks는 YAML 카탈로그에 두고, 로더가 기동 시 읽는다. 코드 룰 추가 경로도 유지한다.
- 완료 기준: 기존 RCA 테스트 전부 통과 + YAML만 추가해 새 룰이 활성화되는 테스트.

### 5. 실서비스 데이터 시나리오

- 내용: cluster-1/2 sandbox namespace에 현실적 장애 주입 매니페스트 세트(CrashLoop, OOMKill, ImagePull, 리소스 고갈, probe 실패)와 주기 실행 스크립트. Prometheus/Loki 메트릭·로그가 evidence로 흘러 RCA 타임라인이 데모 가능한 밀도로 채워지는 것이 목표.
- 완료 기준: 주입 → incident 감지 → RCA 완료 → timeline API 응답까지 E2E 확인.

### 6. 배포 파이프라인 (이번 밤 전용 경로)

- GitHub push 권한이 없으므로: 로컬 dev 커밋 → 소스 zip → S3 → CodeBuild(x86_64, privileged) → ECR push → `kubectl set image`.
- 완료 기준: api-gateway 포함 전체 워커가 새 이미지로 1/1, console origin 기준 `/api/healthz` 200.
- 아침 이후: 우녕님이 dev push하면 기존 GitHub Actions 경로로 회귀. CodeBuild 경로는 비상용으로 문서화만 유지.

### 7. 도메인 연결

- 현재 구성: cloudflared 터널(2 replicas)이 이미 배포됨. LoadBalancer 대신 터널 경유가 팀 구성.
- 순서: api-gateway 복구 확인 → 터널 자격/라우트 확인 → `k8s.woonyong.org` DNS가 터널을 가리키는지 확인, 아니면 Cloudflare API 토큰으로 CNAME 교정 → `https://k8s.woonyong.org/api/healthz` 200 + 로그인 화면 확인.
- WAF: `docs/cloudflare-waf-and-login.md`의 skip-machine-endpoints 규칙 기준 유지.

### 8. 최종 검증 게이트

1. `make check` 상당(린트 + 전체 pytest) 통과
2. 장애 주입 → RCA 완료 → API 응답 E2E
3. `https://k8s.woonyong.org/api/healthz` 200, 로그인, timeline 데이터 확인
4. 인수인계 문서: 완료/미완료, 밤 사이 변경 전체 목록, 키 교체 안내(OpenAI 키·AWS `claude-deploy`(user/k8s) 키·Cloudflare 토큰 — 채팅으로 전달됐으므로 작업 종료 후 교체 권장)

## 순서와 의존성

장애 복구(완료) → 이미지 재빌드·재배포 → 도메인 확인 → LLM 실연결 → fallback worker → 조회 API → 룰 설정화 → 데이터 시나리오 → 최종 검증.
도메인·배포를 먼저 닫는 이유: 이후 모든 작업의 검증(E2E)이 실환경을 전제로 하기 때문이다.
