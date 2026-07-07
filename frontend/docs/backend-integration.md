# 백엔드 실연동

프론트를 실제 api-gateway 백엔드에 붙이는 방법과 검증 결과.

## 연결 방식

- 프론트는 항상 `shared/lib/api.ts`를 통해 실제 Gateway API를 호출한다.
- `VITE_API_BASE` 기본값은 `/api`다.
- Vite dev/preview 의 `/api` proxy 가 `VITE_BACKEND`(기본 `http://127.0.0.1:8000`) 로 전달.
- 운영 화면에 합성 데이터나 대체 응답을 넣지 않는다. 데이터가 없으면 빈 상태를 표시한다.

## 응답 형태 정규화

실백엔드 응답 스키마와 프론트 타입이 다른 엔드포인트는 `shared/lib/adapt.ts`가 흡수한다.
백엔드가 필드를 덜 주면 렌더 크래시를 막는 빈 값만 채운다.
timestamp, cluster id, metric 값처럼 운영 판단에 쓰이는 값은 현재 시각이나 임의 값으로 만들지 않는다.

## 인증·CORS

- 세션: 백엔드가 httpOnly 쿠키(`service_session`) 발급. 프론트는 토큰 저장 안 함.
  로컬 HTTP 테스트는 `COOKIE_SECURE=0` 필요(Secure 쿠키는 HTTPS 에서만 저장됨).
- CORS: gateway `CORSMiddleware`(allow_credentials, origin 화이트리스트). 기본으로
  로컬 개발 origin(5173/4173) 허용. 운영은 `CORS_ALLOW_ORIGINS` 로 지정.

## 로컬 인프라 (root 없이)

api-gateway 는 Postgres+NATS(JetStream)+Redis 필요. 샌드박스에서는 apt deb 추출 +
NATS 정적 바이너리로 root 없이 로컬 기동 가능(테스트 환경 한정).

## 실연동 e2e 검증 결과

`frontend/tests/e2e_real_backend.py` — 실제 브라우저가 gateway 에 붙어 검증한다.
계정 정보는 코드에 쓰지 않고 `AUTH_EMAIL`/`AUTH_PASSWORD` 환경변수로만 주입한다.
운영 DB에 row를 추가하는 write flow는 `E2E_MUTATE=1`을 명시한 경우에만 실행한다.

```bash
BASE_URL=http://127.0.0.1:4173 \
AUTH_EMAIL=<admin email> \
AUTH_PASSWORD=<admin password> \
python3 frontend/tests/e2e_real_backend.py

BASE_URL=http://127.0.0.1:4173 \
AUTH_EMAIL=<admin email> \
AUTH_PASSWORD=<admin password> \
E2E_MUTATE=1 \
python3 frontend/tests/e2e_real_backend.py
```

- 미인증 → /login 리다이렉트
- 실백엔드 로그인 → 세션 쿠키 → 새로고침 세션 유지
- 실 사용자 목록(GET /users)
- `E2E_MUTATE=1`: 조직 생성 → **Postgres 저장 → 목록 반영**(POST/GET /orgs)
- `E2E_MUTATE=1`: 그룹 생성(POST /groups)
- 권한 부여 폼(POST /access)
- `E2E_MUTATE=1`: AI 대화 생성(**실 POST /ai/conversations**)
- 로그아웃 → 세션 종료
- 콘솔 치명 에러 0건

스크린샷: `docs/screenshots/real-0{1..4}-*.png`.
API 레벨(curl)로 G1/G2/G3/G5/G10 + CORS preflight + 401 가드 전수 확인 완료.

## 참고

fresh 백엔드는 클러스터/앱/메트릭 데이터가 없어(에이전트 미연결) 해당 화면은
빈 상태를 정상 표시한다. 클러스터/팟/메트릭 실데이터는 target 클러스터 + cluster-agent
연결이 필요하다(kind/EKS 환경, 샌드박스 범위 밖).
