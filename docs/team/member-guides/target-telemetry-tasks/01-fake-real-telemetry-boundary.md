# 01. Fake / Real Telemetry 경계

## 목표

현재 fake telemetry와 앞으로 설치할 real telemetry의 차이를 문서화한다.

이 작업이 끝나면 작업자가 `fake_telemetry.py`의 Prometheus 모드를 실제 Prometheus로 오해하지 않는다.

## 먼저 읽을 파일

- `src/services/target/cluster-agent/fake_telemetry.py`
- `src/services/target/node-collector/node_collector.py`
- `deploy/target/target.yaml`
- `docs/team/member-guides/target-telemetry-data-flows.md`

## 수정 후보

- `docs/team/member-guides/target-telemetry-data-flows.md`
- 필요하면 `docs/team/member-guides/target-telemetry.md`

## 선형 절차

1. `fake_telemetry.py`의 `FAKE_TELEMETRY_KIND=prometheus` 동작을 확인한다.
2. fake server가 scrape 저장소도 PromQL 엔진도 아니라는 설명을 문서에 넣는다.
3. `node_collector.py`의 `/metrics`가 real Prometheus의 첫 scrape target이라는 설명을 넣는다.
4. `deploy/target/target.yaml`의 fake-prometheus Deployment가 real Prometheus 설치물이 아니라는 점을 적는다.
5. 앞으로 만들 폐쇄 루프를 문서에 고정한다.

## 문서에 넣을 예시

```text
fake-prometheus:
  테스트용 FastAPI 응답 서버
  scrape 저장소 아님
  PromQL query 엔진 아님

real Prometheus:
  /metrics target scrape
  time-series 저장
  HTTP query API 제공
```

## 검증

```bash
rg "fake-prometheus != real Prometheus|scrape 저장소 아님|첫 scrape target" docs/team/member-guides
git diff --check -- docs/team/member-guides/target-telemetry-data-flows.md
```

## 완료 기준

- fake Prometheus와 real Prometheus 차이가 문서에 명시되어 있다.
- 첫 real scrape target이 node-collector `/metrics`라고 적혀 있다.
- 다음 목표가 Prometheus 폐쇄 루프라는 점이 보인다.

## 다음 작업

[02. Observability 설치 경계](02-observability-stack-boundary.md)
