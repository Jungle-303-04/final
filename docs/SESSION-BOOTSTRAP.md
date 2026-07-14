---
title: Opsia — 단일 세션 부트스트랩 (2026-07-14)
status: authoritative
owner: 우녕
purpose: 이 문서 하나만 읽고 즉시 작업을 이어갈 수 있게 한다
---

# 너는 누구고 무엇을 하는가

너는 **Opsia**의 단독 개발 세션이다. 프론트·백엔드·배포·인프라를 **혼자** 담당한다.
이전에 3개 세션(프론트/백엔드/배포)으로 나뉘어 있었으나 조율 비용이 작업 비용을
넘어서 폐기됐다. **네가 전부다.**

**Opsia** = 쿠버네티스 GitOps + AI 근본원인분석(RCA) 플랫폼. 멀티 클러스터 관리.
Krafton Jungle 최종 프로젝트이며 오픈소스 공개를 목표로 한다.

---

# 1. 지금 살아 있는 것 (실측 확인됨)

```
배포 URL     : https://k8s.woonyong.org   (Cloudflare 뒤)
/api/healthz : 200
프론트 번들   : assets/index-CNj2cjXx.js   ← 새 빌드가 서빙 중
```

**AWS 인프라 (전부 실측):**
```
Account   : 183548421506        Region: ap-northeast-2
EKS(관리)  : kubernetes-ops      (타깃: cluster-1, cluster-2 — 멀티클러스터 데모용)
ECR(백엔드): kubernetes-ops-service
ECR(프론트): kubernetes-ops-console
ECR(금지)  : kubeheal-service, kubeheal-console   ← 구 제품명. 쓰지 마라.
DB        : RDS 아님. EKS 안의 postgresql-0 (management 네임스페이스)
볼륨      : Postgres vol-064de27cf0b56d2c5 (30Gi) / NATS vol-06284f30f16497530 (5Gi)
스냅샷    : snap-0bebb31ef7c909f9c (Postgres) / snap-0cd67361e50445185 (NATS)
IAM 역할   : opsia-dev-deploy (GitHub OIDC, sub=repo:Jungle-303-04/final:environment:dev-deploy)
GitHub Env : dev-deploy (dev 브랜치만 허용)
```

**저장소:**
```
origin/dev   ← 유일한 작업 트렁크. lane 만들지 마라.
origin/main  ← 손대지 마라
origin/feat/minmings111/cluster-infra-map-ui  ← 팀원(민정) 브랜치
origin/codex/picture, origin/codex/firework
저장소는 **public**이다 (Actions 무료 러너 확보 목적).
```

**CI/CD:**
```
.github/workflows/dev-gate.yml    ← 전체 게이트. dev push 시 자동. ~2분.
.github/workflows/dev-deploy.yml  ← 배포. FULL / CONSOLE 범위만 존재; first-deploy/cutover 폐기.
AWS_DEV_DEPLOY_ENABLED = **아직 안 켬** (자동 배포 스위치)
```

---

# 2. 유일한 미션

> **references/ui-layer-lab/src/product/ 를 frontend/ 로 만들고, AWS에 배포해서
> 우녕이 새 UI를 실제로 보게 한다.**

## 왜인가

`references/ui-layer-lab/src/product/` 안에 **진짜 새 UI가 이미 있다:**

| 항목 | 값 |
|---|---|
| 파일 | 387개 |
| 코드 | 27,557줄 (production TS/TSX) |
| 테스트 | **962개 전부 통과** |
| 스택 | React 19 / Router 7 / Zod 4 |
| 이름 | "Fleet Control Room" |

**구현된 것:**
- **VP-010 통합 필터 엔진** — `UnifiedFilterProvider`, `filterUrlCodec/Syntax/Scalars`,
  `filterContract`. URL-as-state. (문서로만 기획한 줄 알았는데 코드가 있다.)
- **Home** — HomePage, HomeClusterHealth, HomeIssuesRail, HomeLiveBand
- **Resources** — Page/Table/Toolbar/ViewToggle, **ResourcesGraphShell**(그래프 슬롯),
  DetailSheet, FactsPanel
- **Issues** — Page/Table, IssueDetailSheet, AuditTimelinePanel, RecentChangesPanel
- ClusterScopePicker, ClusterProviderIcon, ClusterConnectionStatus
- API 계층 60여 파일 + zod 스키마 전부
- i18n (한/영), ProductShell/Router/단축키/에러바운더리
- shadcn primitives 25개

**라우트 카탈로그**: home, resources, issues, applications, gitops, catalog, metrics
→ **구현된 화면은 Home / Resources / Issues 3개.** 나머지는 슬롯.

**우녕이 랩을 직접 띄워 보고 "이것이 목표 UI"임을 확정했다.**

## BE-Gap은 0이다

product가 부르는 **21개 API가 origin/dev 백엔드 소스에 전부 존재한다.**
AWS에서 404 나는 2개(`/api/audit/timeline`, `/api/rca/incidents/{id}/recent-changes`)는
**배포 지연**이지 구현 부재가 아니다. **백엔드를 배포하면 해소된다.**

---

# 3. 방향 — 뒤집기 (중요)

이전 세션은 "product를 낡은 frontend 안으로 이식"하려다 **4~6일** 견적을 냈다.
그 비용은 전부 **낡은 쪽을 정본으로 삼아서** 생긴다:
- primitive 25 vs 31 통합 전쟁
- React 19→18, Router 7→6, Zod 4→3 **다운그레이드**
- 옛 router와 새 셸 통합

**그럴 이유가 없다. 뒤집어라.**

```
product 가 frontend 가 된다.
```

1. `frontend/package.json` 을 **product 기준으로 교체** (React 19 / Router 7 / Zod 4).
   **다운그레이드하지 마라.**
2. `references/ui-layer-lab/src/product/**` → `frontend/src/` 로 **통째로 이동.**
   자족적이므로 그대로 동작해야 한다. **테스트 962개도 함께. 전부 통과해야 한다.**
3. `/product` 접두사 제거 → 루트 마운트.
4. **옛 `frontend/src` 삭제.** 단 아래 4개는 먼저 살려둔다.
5. product에 **없는** 화면을 새 셸 아래로:
   - `chat` (RCA AI 챗) — 제품 기능
   - `org` (Settings: 멤버/그룹/권한)
   - `notifications` (알림채널/Ops) → Settings 하위
   - `repo` (Applications/GitOps 실구현) → product의 applications/gitops 슬롯에
   - `cluster` 상세(파드 뷰) → Resources 상세로 흡수 가능한지 판단
   **어차피 새 셸에서 다시 짜야 한다. 이식보다 재작성이 빠를 수 있다.**
6. **theme.css**: frontend의 것은 S1에서 shadcn 토큰 매핑을 마쳤고 **first-paint 플래시
   없음**이 증명됐다(`docs/spec/frontend/theme-first-paint-evidence-*.md`).
   그 자산을 product 쪽에 이식하는 편이 나을 수 있다. **네가 판단하라.**
7. primitive 정본은 **`frontend/src/components/ui/` 한 곳뿐이다.**

**성공 신호**: dev push → 자동 배포 → https://k8s.woonyong.org 에 **새 UI가 뜬다.**

---

# 4. 이미 끝난 것 (다시 하지 마라)

| 항목 | 상태 |
|---|---|
| shadcn 도입 S0~S4 | 완료 — 토큰 매핑, primitive 31개, 차트 recharts 단일화, 아이콘 lucide 단일화 |
| 회귀 가드 테스트 4개 | `lucide_icon_contract`, `theme_token_contract`, `shadcn_primitives`, `legacy_route_cleanup` |
| nivo 제거 | `git grep nivo -- frontend/` = 0 |
| 인라인 SVG 제거 | `git grep '<svg' -- frontend/src` = 0 |
| 레거시 화면 삭제 | HomePage, metrics, workflow, release |
| release-flow 워크플로 5개 | 삭제 |
| **live DB 재생성** | **완료.** 새 PostgreSQL/NATS EBS snapshot 뒤 `public` schema와 JetStream을 비우고 immutable baseline + `alembic upgrade head`를 실행했다. live `alembic_version=20260714_0200`; `admin` 관리자는 Secret 비밀번호로 bootstrap됐다. FIRST_DEPLOY/cutover는 폐기했다. |
| 배포 파이프라인 | digest 주입, FULL/CONSOLE 범위 분리, migration-first, 고정 `admin` bootstrap, in-cluster smoke. 보존 cutover 경로 없음. |
| 좀비 데몬 | 제거 (§5 참조) |
| 브랜치 정리 | 죽은 브랜치 6개 삭제, archive ref 백업 |
| VP-011/VP-013 기획 정본 | dev에 착륙 |

**S5(옛 화면을 하나씩 shadcn으로 이관)는 폐기됐다.** product가 새 셸이므로 무의미하다.

---

# 5. 함정 — 우리가 실제로 당한 것들

## 5-1. 좀비 자동배포 데몬 (가장 큰 사고)
`~/Library/LaunchAgents/org.kubeheal.dev-auto-deploy.plist` (180초 주기)
→ `~/.local/bin/kubeheal-dev-auto-deploy.sh`
→ GitHub Actions를 **우회**해 맥에서 직접 `scripts/aws-up.sh` 실행.

**이것이 저지른 일:**
- `management-schema-bootstrap` Job(**create_all**)로 live DB를 오염시켰다
  → `alembic_version` 부재, 유령 테이블(`workspace_members`, `resource_access_grants`)
- 3분마다 statefulset·Job을 재구성하며 **우리 배포와 클러스터 경합**을 일으켰다
- 한 번도 완주하지 못했다 (LAST_SUCCESS가 오래된 SHA에 멈춰 있었다)

**조치**: 언로드·격리 완료. `org.kubeheal.radar`(kubeconfig 병합)는 아직 살아 있다.
**`scripts/aws-up.sh`, `aws-down.sh`, `down.sh`, `radar.sh`를 삭제하라.**
**배포 경로는 `.github/workflows/dev-deploy.yml` 하나뿐이다.**

## 5-2. Cloudflare가 GitHub runner를 403으로 차단
공개 URL(`https://k8s.woonyong.org`)은 **Cloudflare 뒤**에 있다.
로컬·외부는 200인데 **GitHub Actions runner만 403**이다. 재시도해도 절대 안 뚫린다.
**해법**: smoke를 **in-cluster Service** 호출로 (이미 적용됨). 공개 URL 확인은 경고로만.

## 5-3. console nginx의 stale upstream → 502
`api-gateway` 파드 IP가 바뀌면 console의 nginx가 옛 IP를 붙들어 **502**를 낸다.
이번 세션에서 **두 번** 터졌다.
**근본 해법 (완료)**: `frontend/nginx.conf`와 live `console-dev` nginx 설정에 resolver + 변수 proxy_pass
```
resolver kube-dns.kube-system.svc.cluster.local valid=10s;
set $api_upstream http://api-gateway.management.svc.cluster.local:<port>;
proxy_pass $api_upstream;
```
변수를 쓰면 요청마다 DNS를 다시 푼다. **이 계약을 회귀시키지 마라.**

## 5-4. DB reset 뒤 agent token은 자동 복구되지 않았다
2026-07-14 live DB 재생성으로 `cluster_registrations`의 agent token hash도 삭제됐다.
cluster-1 agent는 기존 Kubernetes Secret token을 계속 보내며 401을 반복했고 자동 재등록하지
못했다. cluster-2에는 cluster-agent Deployment 자체가 없었다. management agent도 gateway
재연결을 기다렸다. **현재 agent는 DB 권한이 사라졌을 때 self-heal하지 않는다.** FULL backend
배포 후 target registration을 명시적으로 다시 수행하고, 장기적으로 401 시 안전한 재등록
handshake 또는 운영 runbook을 제품 계약으로 만들어야 한다. synthetic cluster 데이터로 숨기지 마라.

## 5-5. 삭제된 파일은 병합에서 충돌을 일으키지 않는다
`features/release/**`를 지웠는데 팀원 브랜치 병합으로 **9파일로 부활**했다.
**삭제만으로는 부족하다. 회귀 가드 테스트로 금지 목록을 박아야 한다.**

## 5-6. dev가 계속 움직여 배포가 TOCTOU에 걸린다
`source_sha == dev HEAD` 검증은 여러 세션이 push하는 환경에서 **구조적으로 성립 불가**.
**해법**: `source_sha`가 **dev의 조상 + 그 SHA의 Dev Gate SUCCESS**면 진행.
배포 대상은 "최신"이 아니라 **"검증된 것"**이면 된다. (단일 세션이 되면 완화됨.)

## 5-7. 리소스 단일화 전에 참조 그래프를 확인한다
`console` LoadBalancer를 지웠지만 Cloudflare DNS는 삭제된 ELB를 계속 참조해 사이트 전체가
1016으로 중단됐다. DNS를 터널로 돌린 뒤에는 원격 tunnel ingress도 존재하지 않는
`console.management.svc.cluster.local`을 가리켜 502가 이어졌다. 현재 클러스터 정본은
`console-dev` Deployment/Service이며, `k8s.woonyong.org`는 활성 `kubeheal` 터널을 거쳐
`http://console-dev.management.svc.cluster.local:80`으로 연결된다.

**클러스터 리소스를 지우기 전에 누가 그것을 참조하는지 먼저 확인하라.** 이번 참조자는
Cloudflare DNS와 원격 tunnel ingress였고, 사이트 전체가 죽었다. "단일화"를 할 때는
DNS → tunnel → ingress → Service → Endpoint 참조 그래프를 먼저 그리고, 변경 후 외부
health와 cloudflared 로그를 함께 검증한다.

**Cloudflare DNS와 원격 tunnel ingress는 클러스터 밖에 있다.** `kubectl`에는 보이지
않으므로 Cloudflare API/CLI로 별도 확인한다. GitHub secret도 이름이 존재한다고 유효한
것이 아니다. 잘못된 account/tunnel ID와 무효 API token은 workflow 실행 단계에서만
드러날 수 있으므로 scheduled dry-run preflight로 주기적으로 검증한다.

현재 이름 정본은 `console-dev` Deployment/Service다. `k8s.woonyong.org`는 일반 공개·데모,
`dev-k8s.woonyong.org`는 Bruno/API와 개발 콘솔용 client-certificate mTLS endpoint다.
둘 다 같은 `console-dev` origin을 사용한다. `console`로 이름을 바꾸려면 두 Cloudflare
원격 ingress와 저장소 workflow·`CONSOLE_ORIGIN`·Service/Endpoint를 한 번에 바꾼다.

---

# 6. 규율

## 6-1. 사이클
```
1. git pull --rebase origin dev
2. T1=$(git rev-parse HEAD)
3. make gate-fast          ← 초록이어야 진행 (전체 게이트는 CI가 강제)
4. T2=$(git rev-parse HEAD) ; T1 != T2면 1로
5. git commit && git push origin HEAD:dev
6. night-log에 1줄: [사이클] <무엇> / <SHA> / <다음 한 걸음>
```
**한 사이클 30분 이내.** 넘길 것 같으면 더 작게 쪼개라.
**dev = 배포다. 깨진 커밋 = 깨진 배포.**

## 6-2. 착륙 = 안전이지 완성이 아니다
완벽해질 때까지 들고 있지 마라. **초록이면 착륙시킨다.** 미완인 부분은 다음 한 걸음으로
적어두면 된다. **큰 덩어리를 오래 들고 있는 것이 위반이다.**

## 6-3. BE-Gap 규율 (절대)
백엔드 계약에 없는 필드·상태·kind를 **0으로도, disabled로도 렌더하지 않는다.**
데이터가 없으면 없는 것으로 둔다. **synthetic fallback 금지.**
시계열 결측은 명시적 `gap`. 보간 금지.

## 6-4. 금지
- `:latest` 태그 (digest 고정만)
- 손으로 `kubectl apply` / `docker push` (배포 경로는 워크플로 하나)
- 색·간격·모서리·duration 하드코딩 (토큰만)
- recharts 외 차트 라이브러리
- 인라인 `<svg>` (로고 제외, lucide만)
- 시크릿 값을 로그·문서·커밋에 기록
- `references/ui-layer-lab` 삭제 ← **제품 프론트가 그 안에 있다**

## 6-5. 사람 게이트 (우녕에게 물어라)
- 시크릿·토큰 생성/회전/커밋
- force-push, 공유 이력 재작성
- 프로덕션 DB 파괴 (drop/downgrade/truncate)
- 팀원 소유 브랜치 삭제
- GitHub 조직/저장소 설정 변경
- 비용 발생 AWS 리소스 신규 생성

그 외에는 **상시 GO**다. 승인을 기다리지 마라.

---

# 7. 목표모드

지시받은 작업이 끝나도 멈추지 마라. 아래 사다리를 위에서부터 내려간다.

```
1. product → frontend 전환 (§3)  ← **최우선**
   1-1. package.json 버전 정렬 (React 19/Router 7/Zod 4)
   1-2. product 이동 + 테스트 962개 통과
   1-3. 루트 마운트, 옛 frontend/src 삭제
   1-4. 없는 화면 4개 포팅 (chat/org/notifications/repo)
2. 배포 마무리
   2-1. **일반 경로로 배포 1회 성공** (손 kubectl 없이). run ID 기록.
   2-2. nginx resolver 수정 (§5-3) — 502 근본 해결
   2-3. **AWS_DEV_DEPLOY_ENABLED=1** → dev push 하나로 자동 배포 확인
3. 저장소 정리 + 회귀 가드
   3-1. 삭제: scripts/{aws-up,aws-down,down,radar}.sh, HANDOVER.md,
        deploy/oss/kubeheal-oss.yaml, kubeheal-* 참조 전부
   3-2. 금지 목록 회귀 가드 테스트 (§5-4)
   3-3. **references/ui-layer-lab은 이식 완료 후에만** 삭제 검토
4. 백엔드 계약 (BQ-024 잔여 → BQ-025~034 → BQ-035~038)
   docs/backend-f-workqueue.md 참조
5. VP-012 Resources 4층 (그래프 + 시간 스크럽 바)
   docs/spec/frontend/vp-012-timeline-graph-table.md
6. VP-011 Home 위젯 대시보드 (범용 조합 시스템)
   docs/spec/frontend/vp-011-home-widget-dashboard.md
   ※ BQ-035(catalog) 착륙 후에만. 축·표현·프리셋 하드코딩 금지.
7. 보안 후속
   - POSTGRES_PASSWORD=changeme 회전 (저장소가 public이다)
   - AWS 루트 액세스 키 폐기 → IAM 사용자로 (사람 게이트)
```

**막히면 멈추지 말고 다음 항목으로.** night-log에 `[BLOCKED]` 기록 후 이동.
매 사이클 시작 시 막힌 항목을 1회 재시도한다.
**같은 실패 3회면 접근이 틀린 것이다.** 방법을 바꿔라.

---

# 8. 읽어야 할 문서

```
docs/auto/night-directives.md          ← 결정 로그 [D-001]…[D-046]. 최신부터 읽어라.
docs/backend-f-workqueue.md            ← 백엔드 계약 큐 BQ-001…BQ-038
docs/spec/frontend/vp-010-unified-filter-ia.md      ← 통합 필터 IA (product에 구현됨)
docs/spec/frontend/vp-011-home-widget-dashboard.md  ← Home 범용 위젯 시스템 (별도 착륙 범위)
docs/spec/frontend/vp-012-timeline-graph-table.md   ← Resources 4층 (별도 착륙 범위)
docs/spec/frontend/vp-013-shadcn-migration.md       ← shadcn 통일 (S0~S4 완료)
docs/auto/deploy-status.md             ← 배포 상태
docs/auto/night-log*.md                ← 작업 로그
```

**핵심 결정 요약:**
- [D-023] 제품명 = **Opsia**
- [D-025] 착륙 = 안전이지 완성이 아니다
- [D-035] lane 폐지, dev 단일 트렁크, dev push = AWS 배포
- [D-044] shadcn 단일 소스 (예외 없음)
- [D-045] Home = 범용 위젯 조합 시스템 (엔티티×측정×쪼개기×필터×시간×표현×범위×크기)
- [D-046] 대시보드 계약 BQ-035~038

---

# 9. 성공 정의

```
https://k8s.woonyong.org 를 시크릿 창으로 열면
  → Fleet Control Room 셸이 뜬다
  → Home / Resources / Issues 가 실제 백엔드 데이터로 렌더된다
  → 통합 필터가 URL에 반영된다
  → 콘솔 에러 0
  → 라이트/다크 둘 다 정상
그리고 dev에 커밋을 push하면 자동으로 배포된다.
```

**우녕은 하루를 배포 파이프라인에 썼다. 이제 화면을 보고 싶어 한다.**
설계 라운드를 더 돌지 마라. **만들어서 올려라.**
