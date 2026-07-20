# dev 프론트 + 라이브 백엔드

통합 정본은 `SW_AI_W17-21-final-dev`의 `dev`다. 프론트 작업 결과를 dev에 반영한 뒤 다음 명령으로 로컬 화면을 실제 백엔드에 연결한다.

```bash
cd SW_AI_W17-21-final-dev
make frontend-live
```

기본 주소는 `http://localhost:5173`이고 API와 WebSocket은 같은 origin의 `/api`를 거쳐 `https://k8s.woonyong.org`로 전달된다. 브라우저에는 로컬 소스가 보이고 데이터와 동작은 라이브 백엔드를 사용한다. 의존성이 없으면 lockfile 기준 `npm ci`를 한 번 자동 실행한다. 각 포트는 독립 Vite 캐시를 사용하므로 같은 체크아웃에서 여러 서버를 띄워도 React 모듈 그래프가 섞이지 않는다.

`frontend` 디렉터리에서 익숙한 명령을 실행해도 같은 진입점을 사용한다.

```bash
cd frontend
npm run dev
```

팀원이 동시에 실행할 때는 포트를 나눈다.

```bash
make frontend-live FRONTEND_PORT=5175
make frontend-live FRONTEND_PORT=5176
```

확인 기준:

- `GET http://127.0.0.1:<port>/api/healthz`가 HTTP 200
- `GET http://127.0.0.1:<port>/api/auth/session`이 `authenticated: true`
- 클러스터·저장소·워크플로우 값이 fixture가 아니라 라이브 응답

프론트가 요구하는 계약이 없으면 가짜 값을 추가하지 않고 dev 백엔드를 수정·배포한 다음 같은 로컬 화면에서 재검증한다. `front` 체크아웃은 UI 작업·비교용이며 최종 통합 검증에는 사용하지 않는다.

로컬 api-gateway 자체를 개발할 때만 `npm run dev:local-backend`를 사용한다. 기본 `npm run dev`는 팀 공용 dev 백엔드에 연결된다.
