# 13. Loki / OTel Ingest 경로

## 목표

Prometheus 흐름이 안정된 뒤, Loki log ingest/query 경로와 OTel trace ingest 경로를 작게 검증한다.
현재 Loki는 `scripts/install-telemetry.sh`가 target cluster 안에 올리는 MinIO(`deploy/target/minio.yaml`)를 object store로 사용한다.

## 먼저 읽을 파일

- `src/services/target/cluster-agent/providers/loki_providers.py`
- `src/services/target/cluster-agent/providers/tempo_providers.py`
- `deploy/target/loki.yaml`
- `deploy/target/minio.yaml`
- `deploy/target/opentelemetry.yaml`
- [12. Gateway 계약 연결](12-gateway-contract-connection.md)

## 수정 후보

- `src/services/target/cluster-agent/providers/loki_providers.py`
- `src/services/target/cluster-agent/providers/tempo_providers.py`
- `src/services/target/cluster-agent/evidence/collector.py`
- `tests/test_target_telemetry_evidence.py`

## 선형 절차

1. `TARGET_CONTEXT=<target-context> make install-telemetry`가 target namespace에 `minio-secret`, `minio` StatefulSet, `minio-create-buckets` Job을 만든다는 것을 확인한다.
2. Loki values의 S3 endpoint가 `http://minio.${TARGET_NAMESPACE}.svc:9000`이고, `loki-chunks` bucket을 사용한다는 것을 확인한다.
3. log ingest path와 query path를 분리해서 문서화한다.
4. log evidence에는 redaction filter를 먼저 둔다.
5. trace evidence에는 span id, service name, duration summary만 담는다.
6. payload size limit을 둔다.
7. provider 실패 시 fallback 또는 partial evidence 기준을 정한다.
8. error log sample 또는 trace 레거시 데이터 테스트를 추가한다.

## log evidence 예시

```json
{
  "kind": "log",
  "service": "checkout-api",
  "level": "error",
  "message": "database connection failed",
  "redacted": true,
  "observed_at": "2026-07-04T09:00:00Z"
}
```

## trace evidence 예시

```json
{
  "kind": "trace",
  "service": "checkout-api",
  "span_name": "GET /checkout",
  "duration_ms": 1240,
  "status": "error"
}
```

## 검증

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_telemetry_evidence.py -q
uv run ruff check src tests
```

## 완료 기준

- Loki object store bucket과 ingest/query path가 검증되어 있다.
- secret-like log 내용이 redaction된다.
- 큰 log/trace response가 제한된다.
- Prometheus evidence 흐름을 깨지 않는다.

## 다음 작업

Target / Telemetry 선형 작업은 여기서 끝난다. 이후에는 real 운영 chart hardening, local durable spool, command 우선순위 queue를 별도 작업 페이지로 추가한다.
