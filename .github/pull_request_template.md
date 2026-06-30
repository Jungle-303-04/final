## 요약

- 

## 담당 영역

- [ ] Platform/Integration
- [ ] Gateway/Auth
- [ ] GitOps/Command
- [ ] RCA/Safe PR
- [ ] Target/Telemetry

## 변경 종류

- [ ] feat
- [ ] fix
- [ ] refactor
- [ ] docs
- [ ] test
- [ ] ci
- [ ] chore

## 테스트 증거

- [ ] `make check`
- [ ] `uv run pytest -q`
- [ ] `python -m compileall -q services packages`
- [ ] runtime/deploy/event 흐름이 바뀐 경우 `make smoke`
- [ ] WIKI를 바꾼 경우 WIKI `make check`

## 계약 체크리스트

- [ ] 새 event subject 또는 변경된 event subject가 `EventSubject`와 `docs/events.md`에 반영됨
- [ ] 새 event payload 또는 변경된 event payload가 `packages/contracts/event_bus/payloads.py`에 반영됨
- [ ] 새 worker 구독 또는 변경된 worker 구독이 `settings.py`의 `SUBSCRIPTION`과 `WorkerService.from_subscription(...)` 흐름을 따름
- [ ] event handler가 `EventEnvelope`를 받고, `ack/nak/DLQ`를 직접 처리하지 않음
- [ ] 새 API field 또는 변경된 API field가 Pydantic schema에 반영됨
- [ ] Worker code가 `EventClient`와 `EventHandlerSpec`을 사용함
- [ ] Target write가 `sandbox`로 제한됨
- [ ] secret, token, kubeconfig, `.env` 값이 포함되지 않음
- [ ] architecture, API, workflow, schedule이 바뀐 경우 WIKI/docs를 수정함

## 위험 / 되돌리기

- 위험:
- 되돌리기:
