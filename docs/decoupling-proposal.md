# 디커플링 제안: 로직 / 인프라 / 데이터 정의 분리 (plural 비교 기반)

> 분석 대상: 본 프로젝트 전체 (src/domains, src/packages, src/services, deploy, docs)
> 비교 대상: [pluralsh/plural](https://github.com/pluralsh/plural) (Elixir umbrella, K8s 앱 마켓플레이스/배포 플랫폼)
> 목표: "로직이 바뀌어도 서로 영향 없음 + 로직을 몰라도 새 항목 추가 가능" — 데코레이터/자동 발견 최대 활용, 프로덕션 기준.

---

## 1. 현재 구조 평가 — 이미 잘 된 것

비교 전에 짚을 점: 이 프로젝트는 이미 plural 과 같은 방향의 패턴을 상당 부분 갖추고 있다.

| 패턴 | 본 프로젝트 | plural 대응물 |
|---|---|---|
| 레이어 강제 | import-linter: `domains → packages`, services 역참조 금지 | umbrella: api/worker/rtc → core 단방향 |
| 단일 이미지·다중 entrypoint | `service:local` 이미지 + `command:` 로 29개 서비스 분기 | 단일 코드베이스 + `rel/config/*.exs` 릴리스 4종, CRON 은 env var 로 모듈 선택 |
| 핸들러 등록 DSL | `@app.on(BodyType)` (packages/runtime/app.py:44) | Conduit `subscribe :scan, Scan, from: "plural.scan"` |
| 테이블/repo 자동 발견 | `domains/registry.py` — pkgutil 로 `domains/*/models.py`, `repository.py` 자동 등록 | (해당 없음 — 오히려 본 프로젝트가 더 자동화됨) |
| 쿼리를 데이터로 | `TelemetryQueryDefinition.from_mapping()` — 쿼리는 코드가 아닌 데이터 | Recipe/RecipeItem — 배포 대상 앱 자체가 DB row |
| 명령 핸들러 데코레이터 | `@command_handler` / `@kubernetes_command` (cluster-agent/commands/registry.py:112) | — |

**새 테이블 추가 = 0회 중앙 파일 수정, 새 핸들러 추가 = 0회.** 이 두 곳은 이미 목표 상태다. 문제는 아래 5곳.

---

## 2. 커플링 핫스팟 (전수 조사 결과)

"X 하나 추가하려면 중앙 파일 N개를 수정해야 한다"는 지점만 추린 것.

### H1. 새 이벤트 추가 → 중앙 파일 3곳 수정 (最우선)

새 이벤트 1개를 추가하려면:

1. `packages/contracts/event_bus/subjects.py` — `EventSubject` enum 멤버 추가 (39–113행)
2. 같은 파일 — 새 도메인이면 `STREAM_SUBJECTS` 와일드카드 추가 (16–36행, 주석에 "새 도메인 이벤트 추가 시 여기 와일드카드도 함께"라고 명시돼 있음 = 알려진 수동 동기화)
3. `packages/contracts/event_bus/bodies/__init__.py` — import + `__all__` 재노출 (181행짜리 수동 facade)

부작용이 하나 더 있다. `.importlinter` 의 NOTE 에 적혀 있듯, **bodies facade 가 전 도메인 events 를 한 모듈에 집계하기 때문에 도메인 간 격리 계약(identity 가 형제 도메인 import 금지 등)을 강제할 수 없다.** 즉 이 facade 는 수동 동기화 비용 + 아키텍처 계약 약화, 이중 비용이다.

### H2. 텔레메트리 소스 추가 → 4곳 수정

`cluster-agent/queries/registry.py`:

- `TelemetrySource = Literal["prometheus", "loki", "tempo"]` (6행)
- `SOURCE_EVIDENCE_KEYS` dict (8–12행)
- `to_provider_query()` 의 if-elif 체인 (38–45행)
- `providers/__init__.py` 의 수동 import/`__all__`

새 소스(예: elasticsearch) 추가 시 provider 파일 1개 + 위 4곳. 로직(collector)이 소스 목록을 알고 있는 전형적 커플링.

### H3. 서비스 목록 3중 중복

같은 "서비스 29개" 목록이 세 곳에 독립적으로 존재:

- `src/services/**/app.py` (코드, 진실의 원천)
- `deploy/management/services.yaml` (13 Deployment) + `ai-workers.yaml` (12 Deployment) — 각각 ~55행짜리 거의 동일한 boilerplate
- `docs/architecture.md` 서비스 표

워커 하나 추가 = k8s manifest 55행 복붙 + 문서 수정. drift 를 잡아줄 CI 검증도 없음.

### H4. 게이트웨이 라우터 수동 등록

`gateway.py configure_routes()` (119–133행): 도메인 라우터 6개를 명시적 `include_router`. 규모가 작아 당장은 괜찮지만, 도메인에 router.py 를 만들어도 게이트웨이를 수정해야 노출된다.

### H5. `Database` TYPE_CHECKING 스텁 수동 동기화

`domains/registry.py` 62–80행: 런타임은 자동 발견인데 타입체커용 스텁 클래스는 수동 나열 (주석에 `# pending` 6개). 실수해도 런타임엔 문제없지만 타입 안전성이 조용히 어긋난다.

---

## 3. plural 에서 가져올 패턴

plural 조사에서 확인된, 본 프로젝트에 이식 가치가 있는 것 3가지:

**P-A. 이벤트 정의는 1줄, 행동은 프로토콜 + no-op 폴백.**
plural 은 모든 도메인 이벤트가 `defmodule VersionCreated, do: use Piazza.PubSub.Event` 1줄이고, audit/webhook/notify 같은 범용 컨슈머는 `Auditable`, `Deliverable` 등 프로토콜(`@fallback_to_any true`)로 디스패치한다. **이벤트를 audit 대상으로 만들려면 `defimpl` 하나 추가하면 되고 컨슈머는 절대 수정하지 않는다.** Python 대응물은 `functools.singledispatch` + 기본 no-op.

**P-B. 카탈로그는 데이터, 엔진은 코드.**
plural 의 앱 ~90개는 플랫폼 repo 가 아니라 별도 repo(plural-artifacts)의 YAML/차트다. 앱 추가 = 데이터 업로드, 플랫폼 코드 0줄. 본 프로젝트의 `TelemetryQueryDefinition` 이 이미 이 방향이다 — RCA 룰, command 정책, evidence 쿼리 셋으로 확장할 대상.

**P-C. 배포 형상은 조립 목록 + 공통 템플릿.**
plural 의 루트 GraphQL 스키마는 `import_types` 25줄이 전부고, 워커가 돌릴 파이프라인은 `Worker.conf(:rollout_pipeline) ++ ...` 처럼 config 조립이다. 배포 단위 차이는 `rel/config/` 데이터로만 표현된다. → 서비스별 55행 manifest 복붙 대신 "서비스 목록 데이터 + 템플릿 1개".

---

## 4. 제안

의존 없는 독립 제안 5개. 각각 단독 적용 가능하며, 우선순위 순.

### 제안 1 — 이벤트 자동 발견: bodies facade 제거 + STREAM_SUBJECTS 파생 (H1 해소)

이미 있는 두 메커니즘을 연결하면 끝난다: `@event` 데코레이터(등록)와 `domains/registry.py` 의 `_domain_modules()`(발견).

**(a) `domains/registry.py` 에 이벤트 로더 추가** — models/repository 와 동일 패턴:

```python
def load_domain_events() -> None:
    """domains/*/events.py 임포트 → @event 데코레이터가 EventRegistry 에 자동 등록."""
    _domain_modules("events")
```

**(b) `EventRegistry` 가 스트림 subject 를 파생** — 등록된 subject 에서 도메인 프리픽스를 계산:

```python
# packages/contracts/event_bus/registry.py — EventRegistry 에 추가
def stream_subjects(self) -> list[str]:
    """등록된 이벤트에서 '<도메인>.>' 와일드카드 자동 파생."""
    return sorted({f"{subject.split('.')[0]}.>" for subject in self._defs})

def body_type_for(self, subject: str) -> type[EventBodyContract]:
    """역직렬화용 lookup — bodies facade import 를 대체."""
    return self._defs[EventSubject(subject)]
```

`packages/events/bus.py ensure_stream()` 은 `STREAM_SUBJECTS` 상수 대신 `events.stream_subjects()` 를 쓴다. 수동 와일드카드 목록(subjects.py 16–36행) 삭제.

**(c) `bodies/__init__.py` facade 삭제, 소비자는 소유 도메인에서 직접 import:**

```python
# 변경 전 (facade 경유 — 전 도메인 간접 의존)
from packages.contracts.event_bus.bodies import GitChangedBody
# 변경 후 (소유 도메인 직접 — 의존 그래프가 실제 의존만 반영)
from domains.gitops.events import GitChangedBody
```

`bodies/base.py` 의 `EventBody`, `JsonObject` 는 공유 커널이므로 `packages/contracts/event_bus/base.py` 로 남긴다.

**효과:**

- 새 이벤트 추가 = **도메인 events.py 에 `@event(...)` 클래스 1개. 중앙 파일 0회 수정** (enum 멤버 제외 — 아래 참고).
- `.importlinter` 의 `ignore_imports` 예외(`packages.contracts.event_bus.bodies -> domains.*.events`) 삭제 가능.
- NOTE 에 적힌 후속 과제가 해결됨 → **도메인 간 fine-grained 격리 계약(`independence` contract)을 추가할 수 있게 된다:**

```ini
[importlinter:contract:domain-independence]
name = 도메인은 형제 도메인을 import 하지 않음 (events 계약 제외)
type = independence
modules =
    domains.identity
    domains.mail
    domains.alert
    ...
```

**EventSubject enum 은 유지를 권장.** 문자열 subject 를 데코레이터에 직접 쓰는 방안(`@event("git.changed")`)은 enum 멤버 추가마저 없애주지만, 오타가 런타임까지 살아남고 subject 전수 목록의 단일 출처가 사라진다. enum 멤버 1줄 추가는 "타입체커가 지켜주는 계약 선언"이라 남길 가치가 있다. 수정 파일 수는 3→1이 된다 (enum 1줄).

**마이그레이션:** 소비자 import 교체는 기계적(`grep -rl "event_bus.bodies import"` → sed). 전환기에 facade 를 지우지 말고 `__getattr__` 기반 deprecation shim 으로 남겨 두면 무중단:

```python
# bodies/__init__.py (전환기 shim)
def __getattr__(name: str):
    warnings.warn(f"bodies.{name} 은 소유 도메인에서 import 하세요", DeprecationWarning, stacklevel=2)
    return _resolve_from_registry(name)
```

### 제안 2 — 텔레메트리 소스 데코레이터 레지스트리 (H2 해소)

`@command_handler` 와 동일한 스타일로 provider 를 self-describing 하게 만든다.

```python
# providers/base.py 에 추가
@dataclass(frozen=True)
class TelemetrySourceSpec:
    source: str                 # "prometheus"
    evidence_key: str           # "metrics"
    query_type: type            # PrometheusInstantQuery
    empty_payload: Callable[[], object] = dict

_SOURCES: dict[str, TelemetrySourceSpec] = {}

def telemetry_source(spec: TelemetrySourceSpec):
    """provider 클래스가 자기 소스 계약을 스스로 선언한다."""
    def decorate(cls):
        if spec.source in _SOURCES:
            raise ValueError(f"duplicate telemetry source: {spec.source}")
        _SOURCES[spec.source] = spec
        cls.__source_spec__ = spec
        return cls
    return decorate
```

```python
# providers/prometheus_providers.py
@telemetry_source(TelemetrySourceSpec(
    source="prometheus", evidence_key="metrics", query_type=PrometheusInstantQuery,
))
class PrometheusMetricsProvider: ...
```

그리고 `queries/registry.py` 에서 하드코딩 3형제를 레지스트리 조회로 교체:

```python
# 변경 전                              # 변경 후
TelemetrySource = Literal[...]         # str + _SOURCES 검증
SOURCE_EVIDENCE_KEYS = {...}           # {s.source: s.evidence_key for s in _SOURCES.values()}
def to_provider_query(self):           # spec = _SOURCES[self.source]
    if self.source == "prometheus":    # return spec.query_type(self.name, self.description, self.query)
        ...if-elif 체인...
```

provider 모듈 자동 발견은 `domains/registry.py` 와 같은 pkgutil 패턴을 `providers/__init__.py` 에 적용 (수동 import 목록도 제거).

**효과:** 새 텔레메트리 소스 = **provider 파일 1개 생성으로 끝.** collector/registry/jobs 는 소스 목록을 모른다. `domains/target/evidence_jobs.py` 의 `empty_provider_payload()` if-elif (`provider_key == "logs"` → `[]`)도 spec 의 `empty_payload` 로 흡수된다.

### 제안 3 — 서비스 manifest 생성: 목록은 데이터, 템플릿은 1개 (H3 해소)

plural 의 P-C 패턴. Deployment 25개는 image/env/probe 가 전부 동일하고 `name` 과 `command` 경로만 다르다 — 즉 **서비스별 차이는 데이터다.**

**(a) 서비스 선언을 데이터 파일 1개로:**

```yaml
# deploy/management/services.gen.yaml (단일 출처)
defaults:
  image: service:local
  configMap: management-runtime-config
  secret: management-runtime-secret
services:
  - name: api-gateway
    path: gateway/api-gateway
    http: true            # Service/포트 노출
  - name: alert-worker
    path: alert/alert-worker
  - name: rca-worker
    path: ai/rca-worker
    group: ai              # ai-workers.yaml 로 렌더
  # ...
```

**(b) 생성 스크립트 + CI 정합성 검증:**

```
scripts/render-manifests.py   # services.gen.yaml → services.yaml / ai-workers.yaml 렌더
make render-manifests         # 로컬 생성
make verify-manifests         # CI: 재생성 결과와 커밋된 yaml diff 비교 (drift 차단)
```

검증 스크립트는 추가로 두 가지를 교차 확인한다:

- `services.gen.yaml` 의 모든 `path` 에 `src/services/{path}/app.py` 실존 여부
- 반대로 `src/services/**/app.py` 전수 스캔 결과가 목록에 빠짐없이 있는지 (신규 워커 추가 후 manifest 누락을 CI 가 잡음)

**(c) `docs/architecture.md` 서비스 표도 같은 데이터에서 생성** (`make render-docs` 또는 표 대신 "make services 로 확인" 안내로 대체). 이미 `make events` 로 이벤트 카탈로그를 코드에서 뽑는 프로젝트 철학과 일치한다.

**효과:** 워커 추가 = app.py 생성 + gen.yaml 3줄. manifest 55행 복붙, 문서 표 수동 수정, 목록 drift 전부 소멸. (kustomize 를 이미 쓰고 있으므로 kustomize component/replacements 로도 가능하지만, 25개 서비스 name/command 치환은 커스텀 렌더 스크립트가 더 단순하고 디버깅 쉬움 — 프로덕션에서 흔한 절충.)

### 제안 4 — 게이트웨이 라우터 자동 마운트 (H4 해소, 소규모)

models/repository/events 와 동일한 발견 규약을 router 에도 적용:

```python
# domains/registry.py
def discovered_routers() -> list[tuple[str, APIRouter]]:
    """domains/*/router.py 의 APIRouter 인스턴스 수집 (모듈 알파벳 순 → 등록 순서 결정적)."""
    found = []
    for mod in _domain_modules("router"):
        for name, obj in sorted(vars(mod).items()):
            if isinstance(obj, APIRouter) and not name.startswith("_"):
                found.append((f"{mod.__name__}.{name}", obj))
    return found
```

```python
# gateway.py configure_routes()
for qualified_name, router in discovered_routers():
    app.include_router(router)
```

**주의(프로덕션 기준):** 라우터 자동 마운트는 "인증 가드 없는 라우터가 조용히 노출"되는 리스크가 있다. 완화책 두 가지를 함께 적용한다:

- 규약 강제: `APIRouter(dependencies=[...])` 가 비어 있으면 (health/webhook 등 명시적 allowlist 제외) 기동 시 fail-fast.
- 스냅샷 테스트: `test_gateway_routes.py` 에서 전체 라우트 목록을 골든 파일과 비교 — 라우트 증감이 PR diff 에 반드시 드러난다.

이 정도 안전장치가 부담이면 H4는 현행 유지도 합리적이다 (6개 라우터 수동 등록은 아직 통제 가능한 규모).

### 제안 5 — audit/alert 류 횡단 컨슈머에 singledispatch no-op 폴백 (plural P-A)

현재 `@app.on_any` 프로젝터(audit-worker)가 이벤트별 분기를 내부에 갖게 되면, 이벤트가 늘 때마다 프로젝터를 수정하게 된다. plural 의 `Auditable` 프로토콜 패턴을 이식:

```python
# domains/audit/projection.py
from functools import singledispatch

@singledispatch
def audit_entry(body: object) -> AuditEntry | None:
    return None  # 기본: 감사 대상 아님 (no-op 폴백)

# 각 도메인이 자기 이벤트의 감사 표현을 스스로 등록
@audit_entry.register
def _(body: CommandDispatchedBody) -> AuditEntry:
    return AuditEntry(actor=body.requested_by, action="command.dispatched", ...)
```

audit-worker 는 `entry = audit_entry(envelope.body); if entry: save(entry)` 뿐 — **이벤트가 100개가 되어도 프로젝터 코드는 불변.** 같은 패턴이 alert 정책 게이트, 대시보드 projection 워커에도 적용된다.

**등록 모듈 로딩:** `_domain_modules("projection")` 로 자동 발견 (제안 1의 로더와 동일 규약). 도메인이 감사 표현을 소유하므로 audit 도메인 ← 형제 도메인 의존도 생기지 않는다.

### (보류 권고) H5 — Database 타입 선언 생성

`_discovered_repositories()` 결과에서 TYPE_CHECKING 블록을 생성하고 CI 에서 drift 검증하는 방법이 있으나, 비용 대비 효과가 낮다. `# pending` 주석 6개를 실제 클래스로 채우는 1회성 수정 + PR 체크리스트로 충분.

---

## 5. 적용 순서와 리스크

| 순서 | 제안 | 효과 | 리스크 | 예상 규모 |
|---|---|---|---|---|
| 1 | 제안 1: 이벤트 자동 발견 | 이벤트 추가 3파일→1줄, 도메인 격리 계약 가능 | import 교체 광범위 (기계적) | 중 — shim 으로 무중단 |
| 2 | 제안 3: manifest 생성 | 워커 추가 시 55행 복붙 소멸, drift CI 차단 | 낮음 (생성물 diff 검증) | 소 |
| 3 | 제안 2: 텔레메트리 레지스트리 | 소스 추가 4곳→1파일 | 낮음 (cluster-agent 국소) | 소 |
| 4 | 제안 5: singledispatch 프로젝터 | 횡단 컨슈머 불변화 | 낮음 | 소 |
| 5 | 제안 4: 라우터 자동 마운트 | 소폭 | 보안 규약 필요 | 소 (선택) |

공통 원칙 (프로덕션 기준):

- **모든 자동 발견은 기동 시 fail-fast.** 중복 subject/source/action 등록은 즉시 예외 (기존 `ensure_unique_handler`, `AgentCommandRegistry.register` 와 동일 철학). "조용히 덮어쓰기"는 금지.
- **발견 결과는 관측 가능해야 한다.** `make events` 처럼 `make sources`, `make services`, `make routes` 로 레지스트리 내용을 항상 눈으로 확인 가능하게. 자동화의 신뢰는 카탈로그 가시성에서 나온다.
- **결정적 순서.** pkgutil 발견 결과는 정렬해서 사용 (이미 registry.py 가 그렇게 함) — 환경 간 동작 차이 방지.
- **계약은 린터로 잠근다.** 제안 1 완료 즉시 import-linter 에 domain independence 계약 추가 — 사람이 아니라 CI 가 경계를 지키게.

## 6. 결론

plural 과 구조 철학(단방향 레이어, 단일 이미지 다중 릴리스, 선언적 핸들러 등록)은 이미 동일 선상에 있다. 격차는 **"등록 메커니즘은 있는데 발견이 수동인 곳"** 3곳(이벤트 facade, 텔레메트리 소스, 서비스 목록)이며, 세 곳 모두 이 프로젝트에 이미 존재하는 패턴(`@event` + pkgutil 발견, `@command_handler`, `make events` 카탈로그)을 그대로 연장하면 해소된다. 새 프레임워크·라이브러리 도입 없이, 데코레이터와 규약 기반 자동 발견만으로 "로직을 몰라도 추가 가능, 로직이 바뀌어도 무영향" 상태에 도달할 수 있다.
