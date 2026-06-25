# API Guidelines

## 기본 경로

- `/healthz`: 프로세스 생존 확인
- `/readyz`: 외부 의존성까지 포함한 준비 상태 확인
- `/metrics`: Prometheus 수집용 메트릭
- `/api/v1/...`: 실제 API

## 응답 포맷

성공 응답은 가능하면 `data` 안에 결과를 담습니다.

```json
{
  "data": {
    "id": 1,
    "title": "hello"
  }
}
```

에러 응답은 `error` 안에 사람이 읽을 메시지와 추적용 request id를 담습니다.

```json
{
  "error": {
    "code": "not_found",
    "message": "item not found",
    "request_id": "..."
  }
}
```

## 라우터 구조

```text
app/
  api/routes/
  core/
  db/
  models/
  schemas/
```

라우터는 기능별로 작게 나눕니다.

## 인증

초기 더미 API는 인증 없이 둡니다. 실제 사용자 기능이 생기면 JWT 기반 인증을 붙입니다.

권장 순서:

1. 공개 health/ready/metrics
2. 더미 API
3. 로그인/회원 API
4. 보호 라우터

## 관측성

모든 요청에는 request id를 붙입니다.

- 요청 헤더: `X-Request-ID`
- 응답 헤더: `X-Request-ID`
- 로그 필드: `request_id`
