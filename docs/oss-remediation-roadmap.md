---
title: Opsia 오픈소스 전환 로드맵 (수정본)
status: draft-v3
date: 2026-07-13
based_on: 외부 전략 초안 + 코드베이스 검증(2026-07-12~13, 휴면 자산 전수 조사 포함) + 2026 경쟁 조사
---

# Opsia 오픈소스 전환 로드맵

## 0. 한 문장 정의

> **Opsia는 사람이 시작한 배포든 장애가 촉발한 복구든, 프로덕션에 들어가는 모든 변경이
> 같은 검증 파이프라인(diff → 정책 → 승인 → 사후 검증)을 통과하는
> 오픈소스 Kubernetes 검증 파이프라인 + remediation engine.**

복구 PR은 이 파이프라인의 **입력원 중 하나**다. 자체 GitOps 파이프라인
(render → 3-way diff → SSA dry-run → 정책/risk → 승인 → apply → rollout 검증 → 승격)이
이 약속의 기관실이며, Argo와 겹치는 단계는 apply 한 칸뿐이다(§5.3 applier port).

승부처는 AI가 아니라 **증거·정책·실행 검증을 모두 기록하고 재생할 수 있는 안전성**이다.
브랜드 지표는 두 개다: **harmful action rate 0%**, **"모르면 행동하지 않는다"(insufficient_evidence 정확도)**.

대시보드·AI 챗봇·멀티클러스터 관리는 제품이 아니다. 아래 흐름이 제품이다.

```
Alert 발생 → 증거 자동 수집 → 원인 + 반증 가능한 근거 제시
→ 실제 manifest patch 생성 → dry-run·정책·blast radius 검증
→ rollback 포함 PR 생성 → 배포 후 정상화 검증
```

## 1. 원안 대비 수정 사항 (결정 기록)

| # | 원안 | 수정 | 근거 |
|---|---|---|---|
| R1 | 0~2주에 single-process controller 모드 | **in-process event bus 어댑터**로 배포 프로파일 축소, 4~6주 | README 불변식("단일 앱 회귀 금지") 유지. `src/packages/contracts`의 event bus Protocol port에 in-memory 구현을 추가해 **서비스 코드 경계는 그대로, 배포 형태만 접는다** |
| R2 | SQLite/PostgreSQL 선택 | v0.1은 **내장 단일 PostgreSQL만** | storage 계층이 PostgreSQL 전제. SQLite 지원은 별도 트랙, 채택 병목 아님 |
| R3 | RemediationBundle을 CRD로 | **서명 가능한 YAML/JSON 문서 규격이 정본**, CRD는 표현형 중 하나로 후행 | 우리 아키텍처는 pull-agent + 외부 control plane. 규격의 본질은 "재생 가능한 감사 문서" |
| R4 | 90일에 GitHub+GitLab | **GitHub만**. GitLab은 v0.2 | 범위 과적재 해소. SCM provider 인터페이스는 이미 분리되어 있어 후속 추가 비용 낮음 |
| R5 | 90일에 Argo CD/Flux 연동 | **applier port만 분리하고 v0.1은 자체 모드 단독. Argo-관측 어댑터는 v0.2(벤치마크 공개 후)** | 자체 GitOps가 유일한 1급 시민. sync는 commodity(2026 CNCF: 클러스터 ~60%가 Argo)이므로 정면 경쟁하지 않되, 호환은 신뢰 사다리(read-only→PR→apply)의 중간 칸으로 성장 단계에 추가 |
| R6 | 90일에 플러그인 SDK | **벤치마크 시나리오 포맷을 먼저 공개**, SDK는 기여 포맷이 검증된 후 | 기여 단위는 "새 장애 시나리오 하나"라는 원칙 유지. SDK는 그 포맷이 안정된 뒤 |
| R7 | heal8s를 최우선 경쟁자로 상정 | **존재 미확인 → 선행 검증 태스크로 강등** | 2026-07-12 웹서치에서 저장소 확인 불가. 확인 전까지 전략 근거로 사용 금지 |
| R8 | (없음) | **Alembic 마이그레이션 도입을 필수 목록에 추가** | 현재 `create_all` 방식. 외부 사용자가 v0.1→v0.2 업그레이드 불가능하면 OSS로 성립 안 됨 |
| R9 | (없음) | **기존 자산 재사용 명시**: Loki/Tempo evidence provider, rollout-worker 사후검증, SOPS vault | "정상화 검증"은 신규 개발이 아니라 Bundle `verification` 필드로 기존 기능을 노출하는 작업 |
| R10 | (없음) | **콘솔 4대 구멍을 로드맵에 통합**: 로그 스트림, `command_id` receipt, WS RCA event, rollback 계약 | reference-contract-map.md 분석 결과. 인시던트 제품의 신뢰성에 직결 |
| R11 | §7 = 내부 결함 수리 목록 | **§7을 경쟁력 기능 계층(F0~F6)으로 교체.** 구멍은 삭제가 아니라 기능의 부품으로 흡수 | OSS 채택은 아키텍처 품질이 아니라 "10분 데모에서 스크린샷 찍을 장면"이 결정. 고친 결과가 데모 장면이 되도록 순서를 재편 |
| R12 | PR 코멘트 봇을 유통 1순위로 | **F6로 강등.** 정책 판정·blast radius·사후 검증 링크를 포함할 때만 착수 | 순수 diff 코멘트는 argocd-diff-preview·argo-diff·Infro가 선점(2026-07-13 웹서치 확인). 레드오션 |
| R13 | (없음) | **검증 게이트 승격을 최저비용 자산으로 승격(F3)** | `on_run_completed_promote()`가 rollout health 포함 승격을 **이미 수행 중**(코드 확인). 노출·문서화만 남음 |
| R14 | (없음) | **이벤트 여정 뷰 추가(§7.1)** — 아키텍처 자체를 데모 장면으로 전환 | audit_log가 전 이벤트를 correlation_id와 함께 이미 저장. 렌더링 계층만 신규 |

## 2. 선행 검증 (착수 전, ~3일)

- [x] **heal8s 실존 확인 (2026-07-13 완료)**: github.com/heal8s/heal8s 실존.
  Apache-2.0, Go, operator+GitHub App 구조, OOMKill/ScaleUp/RollbackImage **실제 patch**,
  CRD·Helm chart·`make verify` 원커맨드 Kind 검증, 웹 대시보드. 단 **0 stars·3 commits·
  릴리스 0·기여자 0** — 시장 견인력 없음. 판정: 코드 위협이 아니라 "동일 방향 진입"의
  증거. §4(실제 patch 5종)의 시급성 상향 근거로 사용. 차별화는 원안대로
  (multi-signal evidence, 반증/누락 기록, 정책·blast radius 게이트, 승격 거버넌스,
  multi-tenant) 유지하되 "설치성·공개성"에서는 heal8s가 이미 앞서 있음을 인정.
- [ ] 프로젝트 이름 확정 + 도메인/상표/GitHub org/PyPI 선점 확인.
- [ ] 라이선스 최종 결정 (기본안: Apache-2.0 — 기업 채택·CNCF Sandbox 요건 충족).
- [ ] 팀 캐파 확정. 아래 일정은 **전담 2~3인 기준**이며, 기존 플랫폼 유지보수와 병행 시 1.5배로 늘려 잡는다.

## 3. 핵심 규격: RemediationBundle (v1alpha1)

모든 표면(UI, CLI, GitHub App, 향후 Argo/Flux/CRD)이 소비하는 단일 문서 규격.
**저장·전송 중립적인 서명 가능한 YAML/JSON**으로 정의하고, 스키마는 JSON Schema로 공개한다.

포함 필드(원안 유지): `incident`(source/fingerprint/target), `evidence[]`(type + content-addressed ref),
`diagnosis`(rootCause/confidence/**supportingEvidence/contradictingEvidence/missingEvidence**),
`remediation`(repository/baseCommit/patches/**rollbackPatches**),
`gates`(serverSideDryRun/policyCheck/blastRadiusCheck/humanApproval),
`verification`(successConditions/timeout).

구현 원칙:

1. 기존 event envelope·evidence 저장소에서 **투영(projection)으로 생성**한다. 신규 저장 모델을 만들지 않는다.
2. `contradictingEvidence`/`missingEvidence`는 현재 analyze-worker의 기대근거 대비 실제근거 계산에서 이미 도출 가능 — 규격 노출 작업이다.
3. 모든 판단을 Bundle만으로 재생(replay)할 수 있어야 한다. 이것이 벤치마크의 채점 입력이 된다.

## 4. 실제 patch 완성 (최우선 기술 부채)

현재 `gitops_recovery_review`(builtin.py)는 일부 원인에서 **Markdown 검토 문서 PR**을 생성한다.
v0.1에서 이 경로를 실제 파일 변경으로 교체하거나, 불가능한 원인은 **정직하게 `unsupported`로 종료**한다.
문서 PR을 복구로 포장하지 않는다.

v0.1 지원 5종 (각각 patch + rollback patch + 사후검증 조건 필수):

| 시나리오 | patch 내용 |
|---|---|
| OOMKilled | usage/limit 분석 → 상한 정책 적용한 memory request/limit patch |
| ImagePullBackOff | 최근 정상 digest 확인·존재 검증 → image tag/digest patch |
| CrashLoopBackOff | Git 변경·rollout revision 연결 → 이전 정상 이미지 rollback patch |
| Probe failure | 이벤트·응답 지연 분석 → probe timeout/port/path patch |
| Service selector mismatch | selector vs Pod label 비교 → 최소 selector patch |

그 외 원인: `unsupported` + 수집된 evidence bundle만 제공.

## 5. 배포 프로파일 2종

### 5.1 기본 OSS 모드 (신규, R1 방식)

- 구성: `controller`(전 워커를 in-process bus로 단일 프로세스 조립) + `agent` + 선택형 console
- 인프라: 내장 단일 PostgreSQL. **NATS·Redis·MinIO 불필요**
- 서비스 코드·이벤트 계약은 scale-out 모드와 동일. 차이는 event bus 어댑터와 조립뿐
- 설치: `helm install opsia oci://ghcr.io/opsia/charts/opsia -n opsia --create-namespace` 한 줄
- 목표: **kind에서 10분 내 첫 분석, 15분 내 Alert→PR 데모 완주**

### 5.2 Scale-out 모드 (현행 유지)

NATS JetStream + PostgreSQL + 워커 분리. 대규모 멀티클러스터용. 신규 개발 없음, 문서화만.

### 5.3 applier port (아키텍처 결정)

apply 단계를 port로 분리한다. **v0.1 구현체는 자체 agent applier 하나뿐이며, 우리 GitOps
파이프라인이 유일한 1급 시민이다.** Argo-관측 어댑터(merge 후 Argo sync를 관측하고 사후 검증만
수행, 이 모드에선 자체 reconcile off)는 벤치마크 공개 후 v0.2에 추가한다.

핵심 불변식: render → diff → 정책 → 승인 → 사후 검증 → 승격의 **파이프라인 로직은 두 모드에서
100% 동일**하다. 갈리는 것은 apply 어댑터 하나뿐이며, GitOps 로직의 배제·축소는 없다.

## 6. 벤치마크: 공개 장애 데이터셋

`benchmark/scenarios/` — oom, crashloop, imagepull, probe, service-selector, scheduling, pvc
(+v0.2: network-policy).

각 시나리오 구성(원안 유지): 정상 manifest, 장애 주입 patch, 예상 root cause, 필요 evidence,
허용/금지 remediation, 예상 Git patch, rollback patch, 정상화 판정 조건.

공개 지표: RCA Top-1 정확도, insufficient-evidence 정확도, patch apply 성공률, 정책 위반 제안율,
**harmful action rate**, 정상화 성공률, 평균 LLM 비용(rule-first이므로 근사 0인 것 자체가 차별점), 평균 분석 시간.

시나리오 디렉터리 포맷이 곧 **기여 포맷**이다. 외부 기여의 표준 단위:
"새 장애 시나리오 1개 + (선택) 대응 CauseRule/RemediationGenerator".

## 7. 경쟁력 기능 계층 (비용 오름차순 · 코드 검증 2026-07-13)

기존 "콘솔 4대 구멍"(내부 결함 수리 목록)을 "사용자에게 보이는 기능" 프레임으로 교체한다(R11).
구멍은 사라지지 않고 기능의 부품이 된다: rollback 계약은 F5의 부품, `command_id` receipt와
WS RCA event는 F1~F5가 실시간으로 보이게 하는 배관, 로그 스트림은 인시던트 조사 신뢰성의 기반.

| # | 기능 | 비용 | 이미 있는 것 (코드 근거) | 신규 최소 단위 | 경쟁 상황 |
|---|---|---|---|---|---|
| F0 | in-process event bus | M | event bus Protocol 추상화, `WorkerRuntime` bus 주입 지원 | in-memory 구현 + `App.run()` 배선 + ack/재배달 에뮬 | 기능이 아닌 **채택 관문** — 없으면 아래 전부를 아무도 설치 안 함 |
| F1 | RemediationBundle 조립 | **S** | supporting/missing evidence·refs·checks가 `causes/engine.py`에서 계산되어 `rca_reports` 저장 | 기존 필드 재조합 serializer | 이 규격 자체가 시장에 없음 |
| F2 | 감사 타임라인 + 이벤트 여정 뷰 | **S** | audit-worker가 전 이벤트를 `audit_log`에 correlation_id와 함께 적재 | correlation 정렬 조회 API + `causation_id` 컬럼 보정 + 여정 렌더링 | 판단 재생 가능한 턴키 OSS 없음(규제 니치) |
| F3 | 검증 게이트 승격 노출 | **S~M** | `on_run_completed_promote()`가 rollout health 포함 승격을 **이미 수행** | 관측 윈도우 게이트(선택) + 문서화 | Kargo는 승격 오케스트레이션만, **증거 기반 게이트 없음** |
| F4 | 변경↔장애 상관관계 | M | 워크로드 키 `(workspace, cluster, ns, kind, name)`가 gitops·rca 이벤트 양쪽 존재, `rca_timeline`·`workflow_runs` 완비 | 워크로드 키 조인 projection 1개 + 쿼리 | **OSS 부재.** Komodor·incident.io가 상용 전유. "장애의 ~80%는 변경에서 온다" |
| F5 | 배포 후 검증 → revert PR | M | rollout-worker 판정, `RolloutDiagnosedBody`, 직전 이미지 추적, safe_pr patch 파이프라인 | RolloutDiagnosed→previous_image patch→SafePrRequested 배선(rollback 계약 포함) | Argo Rollouts/Flagger는 canary 계층. "증거 붙은 revert PR"은 블로그 DIY 패턴뿐 |
| F6 | PR 코멘트 봇 (정책 판정 포함) | M | 구조화 diff + `change_context`(risk·rollback 힌트) + 마크다운 렌더러(`change_document`) | issue-comment API 래퍼, commit→PR 매핑, 트리거 워커 | **순수 diff는 레드오션**(argocd-diff-preview·argo-diff·Infro). 정책·blast radius·사후 검증 링크 필수 |

**실행 순서: F0(관문) → F1·F2·F3(S급 서사) → F4(해자) → F5 → F6.**

S급 3개가 완성하는 데모 서사: **"모든 변경은 증거 번들을 남기고, 검증을 통과해야 승격되며,
그 판단 전체를 재생할 수 있다."** F4는 배포 파이프라인과 RCA를 둘 다 가진 자만 만들 수 있는
기능이다 — K8sGPT/HolmesGPT(파이프라인 없음)와 Kargo(RCA 없음)는 구조적으로 따라올 수 없다.

10분 데모의 3장면: ① 증거 문서(Bundle)가 붙은 복구 PR, ② "이 장애 10분 전, PR #42로
image v2.3이 배포됨" 화면, ③ 검증 실패 시 자동 생성된 revert PR.

### 7.1 이벤트 여정 뷰 — 아키텍처의 가시화 (F2의 렌더링 계층)

"이벤트 드리븐 구조가 훌륭하다"는 말은 눈에 보이지 않는다. `audit_log`가 이미 전 이벤트를
저장하므로, 인시던트 하나의 체인(alert → evidence.built → incident.detected →
candidates.planned → evaluated → rca.completed → recovery → safe_pr.created)을 시간순
여정으로 렌더링하면 **모든 인시던트가 아키텍처의 라이브 데모**가 된다.
`causation_id` 컬럼 추가 시 인과 트리로 확장. 이 뷰는 감사 재생 UI이자
신규 기여자용 살아있는 아키텍처 문서를 겸한다.

### 7.2 명시적으로 하지 않는 것

BE-Gap 98개(Helm lifecycle, cost, traffic, exec/port-forward), canary/트래픽 분할 엔진,
순수 diff 코멘트 봇, UI 확장, 멀티 SCM. K8s IDE 기능이지 이 엔진의 기능이 아니다.

### 7.3 정직한 신규 개발 목록 (코드에 존재하지 않는 것)

contradicting(반증) evidence 계산, content-addressed evidence 저장, git revert,
in-memory bus 구현, 이벤트 재생 엔진. Bundle v1alpha1은 supporting/missing 2분류로 출발하고
반증은 v0.2로 미룬다.

## 8. 오픈소스 공개 필수 작업

- 별도의 깨끗한 공개 저장소 (비밀정보·과거 이력 제거, `git filter-repo` 검증 포함)
- LICENSE(Apache-2.0), CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, GOVERNANCE, MAINTAINERS, CHANGELOG
- 영문 README 정본 + 한국어 번역
- **Alembic 마이그레이션 도입** (R8. create_all → revision 기반, 업그레이드/다운그레이드 절차 문서화)
- CI 복구 (공개 저장소 GitHub Actions 무료 티어)
- 공급망: GHCR multi-arch, SBOM, Cosign 서명, SLSA provenance, dependency/secret scan, 공개 advisory 절차
- v0.1.0 릴리스: Helm OCI chart, 업그레이드/삭제 절차, 3분 데모 영상, kind one-command E2E

## 9. OSS / 상용 경계 (원안 유지)

**완전 OSS**: agent·evidence collector, RCA rule engine, LLM fallback(BYOK/local), RemediationBundle 규격,
실제 patch·rollback 생성, dry-run·기본 정책 검사, GitHub PR(→GitLab v0.2), 벤치마크, (후행) 플러그인 SDK, Helm chart·CLI.

**유료/Hosted**: 관리형 control plane, SSO/SCIM, 대규모 fleet 정책, 장기 evidence 보존·검색,
규제 준수 리포트, 조직별 비용/LLM budget, HA/백업/DR, 지원 SLA.

## 10. 90일 실행안 (수정판)

### 0~2주: 기반 + S급 서사 착수

- 선행 검증 4항목 완료 (heal8s, 이름, 라이선스, 캐파)
- 공개용 저장소 골격 + 커뮤니티 파일 + CI 복구
- **F0**: in-process event bus 어댑터 설계 + PoC (전 워커 단일 프로세스 기동 확인)
- `command_id` receipt 수정 (저비용 배관, F1~F5 선행)
- **F1**: RemediationBundle v1alpha1 serializer (supporting/missing 2분류) + JSON Schema 초안
- **F2**: 감사 타임라인 조회 API + `causation_id` 컬럼 보정
- OOMKilled 1종: 실제 patch E2E (recovery_review 경로 대체의 파일럿)

### 3~6주: 코어

- **F0 완성**: 기본 OSS 모드 (controller+agent, 내장 Postgres, NATS 제거 확인)
- Helm chart + kind one-command 데모 (10분 내 첫 분석 측정)
- 실제 patch 5종 + rollback + 사후검증 (§4)
- **F3**: 검증 게이트 승격 노출 + 관측 윈도우 게이트
- **F4**: 변경↔장애 상관 projection + 인시던트 화면 "최근 변경" 섹션
- Alembic 도입
- 로그 스트림

### 7~12주: 공개

- **F5**: 배포 후 검증 실패 → revert PR 자동 생성 배선 (rollback 계약 포함)
- **F2 여정 뷰**: 이벤트 여정 렌더링 (§7.1) — 데모 영상의 중심 장면
- WS RCA event (30초 폴링 제거)
- 벤치마크 10~20개 시나리오 + 공개 채점 스크립트 + 결과 공표
- 공급망 보안 일체 + v0.1.0 릴리스 + 3분 데모 영상 (10분 데모 3장면 포함)
- 외부 사용자 3팀 설치 검증
- 시나리오 기여 가이드 공개 → 외부 기여 유도 시작

### 명시적 후순위 (90일 범위 밖)

**F6** PR 코멘트 봇(정책 판정 포함 형태로만, R12), **Argo-관측 applier 어댑터(v0.2, R5)**,
GitLab provider, 플러그인 SDK, CRD 표현형, SQLite, contradicting evidence(§7.3),
Slack 전용 통합 심화, MCP 서버, SSO/billing/fleet UI,
추가 microservice 분리(중단), BE-Gap 98개(하지 않음).

## 11. 성공 기준 (원안 유지 + 1 추가)

- 새 사용자가 **10분 안에 첫 분석** 완료
- 벤치마크에서 **harmful action 0건**
- 구체적 patch 생성 성공률 **90%+**
- 장애 정상화 성공률 **70%+**
- 외부 3팀 실제 클러스터 설치
- 외부 contributor 규칙/시나리오 **5개**
- PR 제안 중 운영자 채택률 **50%+**
- (추가) **v0.1 → v0.2 업그레이드가 마이그레이션으로 무중단 성공** — OSS 신뢰의 최소 조건

## 12. 한 문장 요약

넓은 백엔드를 더 확장하지 말고, **Alert → Evidence → 실제 Patch → 검증 → PR → 정상화 확인**
흐름을 **한 줄 설치와 공개 벤치마크**로 완성한다. 단, 아키텍처 불변식은 지키고(R1),
근거 없는 경쟁자 가정은 검증 후 반영하며(R7), 업그레이드 가능성(R8)을 공개의 전제로 삼는다.

기능 우선순위의 원칙은 하나다: **이미 계산되고 있는 것을 보이게 만드는 일(F1·F2·F3)이
새로 만드는 일보다 먼저다.** 데모의 3장면(Bundle 붙은 복구 PR, "장애 전 이 배포가 있었다",
자동 revert PR)이 채택을 만들고, 배포 파이프라인 + RCA를 모두 가진 구조(F4)가 해자를 만든다.
