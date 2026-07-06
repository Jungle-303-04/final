# 백엔드 실연동 (real mode)

프론트를 실제 api-gateway 백엔드에 붙이는 방법과 검증 결과.

## 모드 전환

- `VITE_API_MODE=mock` (기본, 데모): `shared/lib/mock/router.ts` 가 응답. 백엔드 불필요.
- `VITE_API_MODE=real`: `shared/lib/api.ts` 가 `VITE_API_BASE`(기본 `/api`) 로 실제 fetch.
  `.env.production` 에 `VITE_API_MODE=real`, `VITE_API_BASE=/api` 설정.
- Vite dev/preview 의 `/api` proxy 가 `VITE_BACKEND`(기본 `http://127.0.0.1:8000`) 로 전달.

## 응답 형태 정규화

실백엔드 응답 스키마 ≠ 프론트 타입인 엔드포인트는 `shared/lib/adapt.ts` 가 흡수
(cluster/application/conversation). 백엔드가 필드를 덜 주면 안전 기본값으로 채워
렌더 크래시를 막는다. mock 은 이미 프론트 형태라 통과.

## 인증·CORS

- 세션: 백엔드가 httpOnly 쿠키(`service_session`) 발급. 프론트는 토큰 저장 안 함.
  로컬 HTTP 테스트는 `COOKIE_SECURE=0` 필요(Secure 쿠키는 HTTPS 에서만 저장됨).
- CORS: gateway `CORSMiddleware`(allow_credentials, origin 화이트리스트). 기본으로
  로컬 개발 origin(5173/4173) 허용. 운영은 `CORS_ALLOW_ORIGINS` 로 지정.

## 로컬 인프라 (root 없이)

api-gateway 는 Postgres+NATS(JetStream)+Redis 필요. 샌드박스에서는 apt deb 추출 +
NATS 정적 바이너리로 root 없이 로컬 기동 가능(테스트 환경 한정).

## 실연동 e2e 검증 결과

`frontend/tests/e2e_real_backend.py` — 실제 브라우저가 gateway 에 붙어 검증:

- 미인증 → /login 리다이렉트
- 실백엔드 로그인 → 세션 쿠키 → 새로고침 세션 유지
- 실 사용자 목록(GET /users)
- 조직 생성 → **Postgres 저장 → 목록 반영**(POST/GET /orgs)
- 그룹 생성(POST /groups)
- 권한 부여 폼(POST /access)
- AI 대화 생성(**실 POST /ai/conversations**)
- 로그아웃 → 세션 종료
- 콘솔 치명 에러 0건

스크린샷: `docs/screenshots/real-0{1..4}-*.png`.
API 레벨(curl)로 G1/G2/G3/G5/G10 + CORS preflight + 401 가드 전수 확인 완료.

## 참고

fresh 백엔드는 클러스터/앱/메트릭 데이터가 없어(에이전트 미연결) 해당 화면은
빈 상태를 정상 표시한다. 클러스터/팟/메트릭 실데이터는 target 클러스터 + cluster-agent
연결이 필요하다(kind/EKS 환경, 샌드박스 범위 밖).
