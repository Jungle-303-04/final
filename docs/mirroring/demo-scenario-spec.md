---
title: Opsia 발표·라이브 데모 마스터 대본
status: canonical-v2
date: 2026-07-20
author: choi woo-nyong
audience: Kubernetes와 Opsia를 처음 보는 비개발자
implementation: docs/mirroring/game-session-handoff-architecture.md
purpose: 발표 문장·화면·조작·증거·동적 연출·실패 대응의 단일 정본
---

# Opsia 발표·라이브 데모 마스터 대본

## 0. 이 대본의 핵심 이야기

발표자는 오늘 다른 팀이 운영하던 라이브 게임을 인계받은 개발자다. 처음 보는 서버를 Opsia에 연결하고, 실제 구조와 게임을 확인하고, Git 저장소를 연결한다. 방을 3개에서 5개로 늘리고, 위험한 변경을 배포하려 한다. Opsia는 변경을 사용자에게 바로 보내지 않고 Canary에서 먼저 검증한다. Canary에서 OOMKilled가 발생하자 승격을 차단하고, 여러 종류의 증거와 1분 전 Replay로 원인을 찾는다. Safe PR로 코드를 고친 뒤 다시 검증하고, 이번에는 실제 게임방을 플레이 중인 사용자의 연결과 상태를 유지하면서 한 방씩 새 버전으로 교체한다. 마지막으로 같은 검증된 버전을 다른 클러스터까지 확장한다.

청중에게 남겨야 할 한 문장:

> Opsia는 서버를 보여주는 화면이 아니라, **연결 → 관측 → 변경 → 사전 검증 → 장애 재현 → 원인 분석 → 안전 복구 → 무중단 확산**을 하나의 증거 흐름으로 연결하는 운영 플랫폼입니다.

## 1. 발표 전에 반드시 충족할 조건

### 1.1 구현 완료 조건

- `game-server`는 실제 agent outbound 연결 상태다.
- management cluster는 `management-server`, 게임 cluster는 `game-server`, YAML 검증 대상은 `demo-server`로 표시한다.
- management cluster는 관측 가능하지만 일반 사용자의 변경 action은 권한으로 비활성화한다.
- game-server에는 room-0~room-4를 만들 수 있는 profile과 동적 registry가 있다.
- 브라우저는 game Pod가 아니라 Session Gateway에 연결한다.
- planned rollout handoff E2E가 통과한다.
- Canary는 live matchmaking·Gateway·Redis key·active lease와 격리한다.
- Canary snapshot backlog→OOMKilled가 실제 Kubernetes Event로 재현된다.
- Safe PR 수정 뒤 같은 부하에서 재발하지 않는다.
- Alert·Incident·Timeline·Replay·RCA·Release Workflow가 동일 correlation/operation ID를 사용한다.
- 게임 PiP, downstream WebSocket close count, session continuity metric이 실제 데이터다.

구현 세부는 [게임방 무중단 세션 전환 · 장애 재현 · 운영 이벤트 구현 명세](./game-session-handoff-architecture.md)를 따른다.

### 1.2 사전 데이터와 브라우저 준비

- Chrome 창 1: Opsia 로그인, 홈 화면
- Chrome 창 2: `https://game.woonyong.org/`, room-1 플레이 중
- 터미널: game-server agent 설치 명령 실행 준비
- Git 저장소: 정상 revision과 위험 변경 branch 준비
- Bot Runner: `80 → 200 → 검증 목표치` 단계 명령 준비
- 발표 시작 직전 Timeline cursor와 서버 시간이 동기화되었는지 확인
- Canary snapshot baseline과 위험 주기는 그날 benchmark 결과로 확정
- browser network recorder에서 Session Gateway WebSocket close count를 확인할 수 있게 준비

### 1.3 비개발자용 용어

| 기술 용어 | 발표에서 먼저 사용할 표현 | 한 번만 덧붙일 설명 |
|---|---|---|
| Workspace | 회사의 운영 공간 | 여러 서버 묶음과 권한을 함께 관리하는 가장 큰 범위 |
| Cluster | 서버 묶음 | Kubernetes가 관리하는 서버들의 집합 |
| Node | 실제 일을 하는 서버 | 여러 게임 프로그램이 올라가는 컴퓨터 |
| Pod | 실행 중인 프로그램 단위 | 이번 데모에서는 활성 게임방 하나를 처리하는 게임 서버 프로세스 |
| Agent | 현장 중계기 | 클러스터가 외부에서 문을 열지 않고 Opsia로 상태를 보내는 프로그램 |
| GitOps | Git을 기준으로 운영 상태 동기화 | 누가 무엇을 바꿨는지 기록하고 서버가 그 상태를 따라가게 하는 방식 |
| Canary | 사전 검증용 작은 복제 환경 | 실제 사용자에게 보내기 전 같은 버전을 먼저 시험하는 곳 |
| RCA | 원인 분석 | 여러 증거를 시간순으로 연결해 가장 가능성 높은 원인을 찾는 과정 |
| Safe PR | 검증 근거가 붙은 수정 제안 | 사람이 확인하고 병합할 수 있는 안전한 Git 변경 |
| Session Gateway | 연결을 유지하는 중간 문 | 브라우저 연결은 그대로 두고 내부 게임 서버만 교체 |

## 2. 전체 진행 요약

```text
인수 상황
→ 서버 묶음 연결
→ 권한·수집 상태 확인
→ Node·Pod·게임방 구조 확인
→ 실제 게임 PiP
→ Git 저장소 연결
→ 방 3개에서 5개로 확장
→ AI 알림 규칙 설정
→ 위험한 snapshot 변경
→ Canary 검증
→ snapshot backlog·OOMKilled
→ 승격 자동 차단
→ Event log와 1분 전 Replay
→ Git·Kubernetes·Metric·Log·Traffic 증거 결합
→ RCA
→ Safe PR와 전역 복구 알림
→ 수정 Canary 재검증
→ 실제 게임방 무중단 순차 교체
→ 전후 비교·감사
→ demo-server 확산
→ 결론
```

## 3. 처음부터 종료까지 상세 발표 대본

## 장면 1. 인수 상황을 연다

**화면**: 홈. 좌측 메뉴, 상단 Workspace·Cluster·Namespace 범위, 운영 요약 위젯이 한 화면에 보이게 한다.

**발표 대사**

> 저는 오늘 다른 팀이 운영하던 라이브 게임 서비스를 인계받은 개발자입니다. 게임은 이미 서비스 중인데, 어떤 서버에서 무엇이 실행되고 있는지, 최근에 누가 무엇을 바꿨는지, 장애가 나면 어디서부터 봐야 하는지 아직 모릅니다.
>
> 여기 보이는 워크스페이스는 우리 회사의 운영 공간입니다. 그 아래에 회사가 관리하는 서버 묶음들이 있고, 각 묶음 안에 실제 서버와 프로그램들이 있습니다. 오늘은 이 중 게임 서버를 새로 인계받아 연결부터 변경·장애·복구까지 진행해보겠습니다.

**조작**

- Workspace selector를 한 번 열어 조직 범위임을 보여주고 닫는다.
- Cluster selector에서 현재 연결된 목록을 잠깐 보여준다.
- `management-server`는 자물쇠/관측 전용 표시를 가리킨다.

**반드시 보일 증거**

- management-server: connected, read-only capability
- game-server: 아직 연결 전 또는 연결 대기
- demo-server: 검증·확산 대상
- 데이터 시각과 freshness

**전환 대사**

> 먼저 인계받을 게임 서버 묶음을 Opsia에 연결하겠습니다.

## 장면 2. 클러스터 연결 위저드를 연다

**화면**: 홈 우측 상단 `클러스터 연결` → 3단계 위저드.

**발표 대사**

> 일반적인 운영 도구는 중앙 서버가 현장 서버 안으로 접속하기 위해 방화벽을 열거나 자격 증명을 보관합니다. Opsia는 반대입니다. 현장에 작은 Agent를 설치하면 Agent가 바깥쪽으로 안전하게 연결합니다. 따라서 게임 서버가 외부 접속을 허용할 필요가 없습니다.

**조작**

1. Amazon EKS 선택
2. 이름 `game-server`
3. 환경 `production`
4. `설치 명령 생성`

**동적 연출**

- 플랫폼 카드 선택 시 check slot 폭을 고정해 레이아웃이 움직이지 않는다.
- 1→2단계는 spring transition.
- 발급 token은 항상 `••••`로 마스킹한다.

**전환 대사**

> 필요한 정보는 이것뿐입니다. 이제 생성된 명령을 현장 터미널에서 실행하겠습니다.

## 장면 3. Agent 설치와 실시간 연결을 보여준다

**화면**: 위저드 설치 단계와 터미널을 나란히 둔다.

**발표 대사**

> 이 한 줄의 명령이 Agent를 설치합니다. 설치가 끝나면 Agent가 먼저 Opsia에 신호를 보내고, 서버 목록과 권한, 관측 가능한 항목을 순서대로 전달합니다.

**조작**

- 복사 버튼 클릭
- 터미널에 붙여넣고 실행
- 다시 위저드로 돌아와 진행 상태 관찰

**화면 상태 순서**

```text
설치 명령 발급
→ Agent 등록
→ outbound 연결
→ heartbeat
→ API discovery
→ inventory 수집
→ 권한 검사
→ metric/log provider 확인
→ ready
```

**발표 대사**

> 지금 초록 점이 순서대로 들어오고 있습니다. 단순히 “연결됨” 한 줄로 끝내지 않고, Agent가 살아 있는지, 어떤 정보를 볼 수 있는지, 실행 권한이 어디까지인지까지 확인합니다. 빠르게 연결됐네요.

**반드시 보일 증거**

- 마지막 heartbeat
- 관측된 Kubernetes version
- Node/Pod actual count
- agent outbound 표시
- Prometheus/Loki 연결 상태
- capability summary

## 장면 4. 연결 직후 점검과 권한을 확인한다

**화면**: 점검 또는 Cluster 상세.

**발표 대사**

> 서버가 연결됐다고 바로 변경하지는 않습니다. 먼저 수집이 완전한지와 제 계정이 어떤 작업을 할 수 있는지 확인합니다. 예를 들어 관리 서버는 보이지만 실수로 수정할 수 없고, 게임 서버는 승인된 범위에서만 배포와 로그 조회를 할 수 있습니다.

**조작**

- management-server action이 disabled인 이유 tooltip
- game-server의 logs, YAML, rollout capability
- 수집 상태 `정상/수집 중/권한 부족/미지원` 구분

**전환 대사**

> 이제 이 서버 묶음 안에서 실제로 무엇이 돌고 있는지 들어가 보겠습니다.

## 장면 5. Cluster → Node → Pod 물리 보기를 연다

**화면**: 리소스의 물리 보기. Cluster에서 Node로, Node에서 Pod로 확대한다.

**발표 대사**

> 가장 바깥은 서버 묶음이고, 그 안의 큰 칸은 실제 일을 하는 서버입니다. 그 서버 위에 올라간 작은 실행 단위가 Pod입니다. 이번 게임에서는 **활성 게임방 하나를 게임 Pod 하나가 처리**합니다.
>
> 캐시와 상태 동기화를 담당하는 Redis, 사용자를 방으로 안내하는 Gateway, 그리고 room-0부터 room-2까지 세 게임방이 보입니다.

**조작**

- Cluster 클릭 → Node 확대
- Node 클릭 → Pod 분포 확대
- Redis, Session Gateway, game room Pod 순서로 hover
- room-1 Pod 클릭

**동적 연출**

- Node→Pod 확대는 위치 관계를 유지하는 zoom.
- 현재 사용량에 따라 Pod가 초록·주황·빨강으로 변한다.
- 긴 이름은 한 줄 말줄임, hover 시 전체 이름.

**반드시 보일 증거**

- Node Ready와 capacity/usage
- Pod Ready, image revision, CPU/memory, restart
- room ID와 active Pod 관계
- Redis·Gateway·room service 관계선

## 장면 6. 게임방 상세에서 운영 정보를 확인한다

**화면**: room-1 게임 Pod 상세 drawer.

**발표 대사**

> room-1을 열어보면 현재 준비 상태, 실행 이미지, 사용량, 최근 재시작, 소유 관계와 이벤트를 한곳에서 볼 수 있습니다. YAML은 서버의 현재 설정을 표현하는 문서라고 생각하시면 됩니다. 로그와 터미널은 권한이 있는 사용자에게만 열립니다.

**조작**

- Overview → Metrics → Events → Related 순서로 짧게 전환
- YAML 버튼을 열되 아직 수정하지 않는다.
- action disabled 이유 한 개를 보여준다.

**전환 대사**

> 숫자만 봐서는 실제 서비스가 어떤 모습인지 감이 오지 않으니, 사용자가 보는 게임을 직접 열겠습니다.

## 장면 7. 실제 게임을 열고 PiP로 고정한다

**화면**: Service 상세의 `서비스 접근` → `https://game.woonyong.org/`. room-1 플레이 후 PiP로 고정.

**발표 대사**

> 실제 사용자는 이 주소로 게임에 들어옵니다. 지금 room-1에서 캐릭터가 움직이고 있고, 점수·체력·인벤토리 상태가 있습니다. 이 화면은 앞으로 우측 아래에 계속 띄우겠습니다. 서버 설정을 바꾸는 동안 연결이나 상태가 사라지는지 눈으로 확인하기 위해서입니다.

**반드시 보일 증거**

- room-1
- stable session 표시(민감값은 hash/축약)
- player state
- Session Gateway connection indicator
- reload count 0

**전환 대사**

> 앞으로 우리가 운영할 서비스이니, 서버 상태의 기준이 되는 Git 저장소도 연결하겠습니다.

## 장면 8. Git 저장소를 연결한다

**화면**: 배포 또는 설정의 Git repository 연결 surface.

**발표 대사**

> Git은 서버 설정의 변경 이력입니다. 누가 언제 무엇을 바꿨는지 남고, Opsia는 이 기준과 실제 서버 상태가 같은지 계속 확인합니다. 주소만 넣으면 GitHub인지 자동으로 인식하고, 필요한 인증 정보는 화면이나 로그에 평문으로 남기지 않습니다.

**조작**

1. repository URL 입력
2. provider 자동 인식 badge 확인
3. token 마스킹 입력
4. branch와 manifest path 확인
5. probe·schema·permission 통과
6. 연결 완료

**반드시 보일 증거**

- repository/branch/path
- detected provider
- current revision
- GitOps application
- sync/health

## 장면 9. 정상 변경으로 방을 3개에서 5개로 늘린다

**화면**: `GameFleet` YAML 또는 배포 설정.

**발표 대사**

> 접속자가 늘어날 상황에 대비해 게임방을 세 개에서 다섯 개로 늘려보겠습니다. 이 게임은 방 하나가 활성 게임 Pod 하나에 대응하므로, 단순히 같은 방의 처리량을 늘리는 것이 아니라 사용자가 선택할 수 있는 독립된 방 두 개를 추가하는 변경입니다.

**조작**

```yaml
spec:
  desiredRooms: 3
```

를 다음으로 수정한다.

```yaml
spec:
  desiredRooms: 5
```

- `저장 및 배포`
- validation → diff → commit/PR → merge → sync 단계 확인

**발표 대사**

> 수정한 내용이 Git에 기록되고, Opsia가 변경 차이와 영향을 확인한 뒤 서버 묶음이 그 상태를 따라갑니다. Git 연결 여부를 사용자가 매번 고르지 않아도 서버가 정책에 맞는 경로를 선택합니다.

**동적 연출**

- room-3, room-4는 점선 placeholder
- scheduled 회색 → initializing 파랑 → ready 초록
- 방 수 counter 3→4→5

**논리 주의**

- Candidate Pod는 새 방 수에 포함하지 않는다.
- 이 단계는 `replicas: 3→5`가 아니라 desired room policy 변경이다.

## 장면 10. 게임 관제에서 실제 방 증가를 확인한다

**화면**: 게임 관제와 물리 보기를 분할 또는 전환. PiP 유지.

**발표 대사**

> 서버 화면에서 room-3과 room-4가 준비됐고, 실제 게임 관제에도 다섯 개 방이 나타났습니다. 이제 사용자는 새 방을 선택할 수 있습니다. 화면상의 숫자만 바뀐 것이 아니라 실제 접속 probe까지 통과했습니다.

**조작**

- room-4 접속 probe
- physical view에서 room-3·4
- Git revision과 resourceVersion 표시

**전환 대사**

> 이제 접속자가 늘 때 운영자가 놓치지 않도록 알림을 하나 만들겠습니다.

## 장면 11. AI로 복합 알림 규칙을 만든다

**화면**: AI Assistant panel.

**질문**

```text
game-server의 게임방 CPU가 70%를 5분 넘게 유지하거나,
snapshot backlog가 10개를 넘으면 높은 심각도 알림을 만들어줘.
```

**발표 대사**

> 자연어로 요청해도 AI가 바로 몰래 실행하지는 않습니다. 대상·지표·조건·지속 시간·심각도와 알림 채널을 구조화해 보여주고, 제가 확인한 뒤 적용합니다.

**조작**

- AI 분석 단계 spinner
- 규칙 preview 펼침
- cluster/namespace/workload/threshold 확인
- 승인 후 적용

**논리 주의**

> 알림은 상태를 알려주는 기능입니다. 방을 늘리는 동작은 GameFleet 정책, Pod 수를 자동 조절하는 동작은 별도의 확장 정책이 담당합니다.

## 장면 12. 위험한 변경을 시작한다

**화면**: Git Diff 또는 YAML editor와 Release Workflow.

**발표 대사**

> 다음은 실제 운영에서 흔히 생기는 설정 실수를 재현하겠습니다. 게임 상태를 Redis에 저장하는 주기를 지나치게 짧게 바꾸면, 저장 완료보다 새 저장 요청이 더 빨리 생겨 작업이 쌓일 수 있습니다.
>
> 여기서 중요한 점은 이 위험한 버전을 실제 플레이어가 있는 방에 바로 배포하지 않는다는 것입니다. 먼저 사용자와 분리된 Canary에서 같은 이미지와 정책으로 검증합니다.

**조작**

- `OPSIA_SNAPSHOT_SAVE_INTERVAL_MS: 1000`을 benchmark에서 정한 위험 주기로 변경
- Diff에서 한 줄 변경을 강조
- `저장 및 배포`

**반드시 보일 증거**

- base SHA
- changed key
- author/audit reason
- target `canary first`

## 장면 13. Release Workflow가 Canary를 준비한다

**화면**: 노드 기반 Release Workflow.

**발표 대사**

> 변경을 누르자 여러 검증이 순서대로 실행됩니다. Git 변경을 읽고, 배포 문서를 만들고, 정책을 검사한 뒤, 실제 사용자에게 연결되지 않는 Canary 게임방을 준비합니다.

**노드 흐름**

```text
Git 변경
→ Manifest Render
→ Policy
→ Canary 생성
→ Readiness
→ 검증 부하
→ Metric Gate
```

**동적 연출**

- active node는 파란 pulse
- 실행 중 edge는 좌→우 흐름
- 완료 node는 초록 check
- 우측 전역 알림에도 같은 현재 단계 표시

**발표 대사**

> 이 상태는 화면이 임의로 계산한 것이 아니라, 각 실행 단계가 남긴 operation event를 실시간으로 보여주는 것입니다. 다른 화면으로 이동해도 오른쪽 알림에서 진행을 계속 볼 수 있습니다.

## 장면 14. Bot 부하와 실제 OOMKilled를 관측한다

**화면**: Canary 상세의 Metric, 로그 일부, 우측 workflow.

**발표 대사**

> Canary에 실제 게임 봇을 넣겠습니다. 처음에는 정상입니다. 하지만 저장 주기가 너무 짧아 새 저장 작업이 계속 겹치고 있습니다.

**조작**

- Bot Runner 단계 증가
- snapshot inflight/backlog 그래프
- Redis write duration
- process RSS와 container memory

**화면 변화**

```text
snapshot inflight 증가
→ backlog alert
→ memory 초록에서 주황
→ event loop lag 증가
→ memory 빨강
→ OOMKilled
→ Canary restart
→ Metric Gate 실패
→ PromotionBlocked
```

**발표 대사**

> 결국 Canary가 메모리 한도를 넘어 강제 종료됐습니다. 그러나 실제 room-1 게임은 계속 실행 중이고 PiP도 끊기지 않았습니다. Opsia가 위험한 버전의 실제 게임방 승격을 자동으로 차단했습니다.

**반드시 보일 증거**

- Kubernetes termination reason `OOMKilled`
- Pod UID·restart count
- actual memory limit과 peak
- promotion blocked reason
- live revision unchanged
- live session close count 0

## 장면 15. 여러 알림을 하나의 인시던트로 묶는다

**화면**: 우측 상단 Alert 등장 → Incident 생성 animation.

**발표 대사**

> 메모리 경고, snapshot backlog, 게임 프로세스 재시작은 서로 다른 알림이지만 같은 Canary와 같은 시간대에서 발생했습니다. Opsia는 이를 별개의 문제 세 개로 보여주지 않고 하나의 장애 흐름으로 묶습니다.

**동적 연출**

- 세 알림 chip이 하나의 Incident card로 합쳐짐
- 영향 범위 `canary only`, 사용자 영향 `0`
- severity, start time, current state

**전환 대사**

> 이벤트 기록을 보니 1분 전에 장애가 있었네요. 당시 화면을 되감아 보겠습니다.

## 장면 16. 1분 전으로 Replay한다

**화면**: Timeline 또는 리소스 Live Player. `현재`에서 `-1분`으로 scrub.

**발표 대사**

> 이벤트 로그를 보니 1분 전에 장애가 있었네요. 사실 리소스 화면은 라이브 플레이어처럼 이전 상황을 다시 볼 수 있습니다. 되감기하듯 1분 전으로 돌려보겠습니다.
>
> 이 시점에는 Canary Pod가 정상이었습니다. 시간을 조금 앞으로 움직이면 snapshot 작업이 쌓이고, 메모리가 주황색으로 바뀌고, 여기서 Pod가 빨간색으로 전환되며 재시작됩니다. 지금 보고 있는 것은 꾸며낸 애니메이션이 아니라 그 시각에 스트리밍으로 수집해 보존한 frame과 event입니다.

**조작**

1. Git 변경 pin 선택
2. Canary Ready 시점
3. backlog 시작
4. memory pressure
5. OOMKilled
6. promotion blocked

**동적 연출**

- 과거 모드임을 상단에 고정 표시
- Pod 상태가 해당 시점 값으로 바뀜
- Git 변경과 OOMKilled pin을 같은 축에 둠
- 현재로 돌아오기 버튼 제공

**반드시 보일 증거**

- frame timestamp/freshness
- event source
- Git SHA
- Pod UID/resourceVersion
- 과거 데이터 누락 시 정확한 missing reason

## 장면 17. 트래픽으로 영향 범위를 좁힌다

**화면**: Traffic view. Canary와 live room 흐름을 구분한다.

**발표 대사**

> 먼저 요청 흐름을 봅니다. 오류 흐름은 Canary 내부에서만 빨갛고, 실제 사용자 Gateway와 room-0부터 room-4의 연결은 초록입니다. 따라서 외부 네트워크 전체 문제나 Redis 전체 장애가 아니라 Canary 프로세스 내부 문제로 범위를 좁힐 수 있습니다.

**동적 연출**

- 요청률에 따라 선 굵기 변화
- 오류 경로만 빨강
- live path는 초록 유지

**논리 주의**

> Traffic 화면은 원인을 확정하는 화면이 아니라 영향 범위와 병목 위치를 좁히는 증거입니다.

## 장면 18. 메트릭·Kubernetes Event·서비스 로그를 결합한다

**화면**: Incident evidence panel. 증거를 순차 펼침.

**발표 대사**

> 한 가지 숫자만 보고 결론을 내리면 오판할 수 있습니다. 이번에는 서로 다른 네 종류의 증거를 같은 시간축에서 보겠습니다.

**증거 1 — Git**

> 장애 직전에 snapshot 저장 주기가 짧아진 변경이 있었습니다.

**증거 2 — 메트릭**

> 변경 이후 snapshot 동시 실행 수와 대기 시간이 먼저 증가했고, 그 뒤에 프로세스 메모리가 한도까지 올랐습니다.

**증거 3 — Kubernetes Event**

> 운영체제 수준의 종료 이유는 OOMKilled입니다. 메모리 한도를 넘었다는 직접 증거입니다.

**증거 4 — 서비스 로그**

> 이제 게임 서버가 직접 남긴 로그를 보겠습니다. `snapshot_backlog`의 inflight와 oldest age가 계속 커지고, OOM 직전에는 저장 timeout과 event loop lag가 함께 기록됐습니다. 핵심 문장이 자동으로 강조됩니다.

**반대 증거**

- Node memory pressure 없음
- NetworkPolicy 변경 없음
- live Redis와 live room 정상
- 외부 network drop 없음

**발표 대사**

> 따라서 “메모리가 높다” 수준이 아니라, **저장 주기 변경 때문에 비동기 snapshot 작업이 처리 속도보다 빨리 생성됐고, 적체된 작업이 메모리를 밀어 올려 Canary가 OOMKilled됐다**는 인과관계를 설명할 수 있습니다.

## 장면 19. RCA 후보가 증거에 따라 수렴한다

**화면**: RCA candidate list와 evidence coverage.

**발표 대사**

> 처음에는 노드 부족, Redis 장애, 네트워크 문제, 설정 회귀가 모두 후보입니다. 증거가 들어올수록 맞지 않는 후보가 내려가고, snapshot backpressure 설정 회귀의 충족률이 올라갑니다.

**조작**

- 후보 1 펼침: snapshot backpressure
- 후보 2: node pressure, 반대 증거
- 후보 3: Redis outage, 반대 증거
- “왜 이 결론인가?” AI 질문

**AI 답변에 포함할 항목**

- 결론과 confidence
- 직접 증거
- 시간적 선후 관계
- 반대 증거
- 아직 관측하지 못한 항목
- 사용자 영향이 0인 이유

## 장면 20. 즉시 보호 상태를 확인한다

**화면**: Release Workflow의 `PromotionBlocked`, Canary 자동 정리/이전 이미지 복귀.

**발표 대사**

> 이번에는 실제 사용자 버전을 롤백할 필요가 없습니다. 위험한 버전이 Canary를 넘지 못했기 때문입니다. 검증 대상만 이전 정상 revision으로 돌아가고, 실제 게임방은 처음부터 정상 버전을 유지했습니다. 분석 증거는 Pod가 정리된 뒤에도 Evidence Bundle에 남습니다.

**반드시 보일 증거**

- live revision unchanged
- Canary rollback/cleanup receipt
- sealed evidence time range
- live player impact 0

## 장면 21. AI에게 최소 수정안을 요청한다

**화면**: Incident 안의 AI panel.

**질문**

```text
주기만 되돌리는 임시 조치 말고 같은 실수가 재발하지 않게 최소 수정안을 제안해줘.
왜 그 수정이 필요한지도 증거별로 설명해줘.
```

**발표 대사**

> AI는 단순히 값을 원복하라고 하지 않습니다. 동시에 하나의 snapshot만 저장하도록 single-flight를 넣고, 저장 중 들어온 요청을 무한히 쌓지 않고 최신 요청 하나로 합치며, 위험한 최소 주기와 metric을 추가하자고 제안합니다.

**제안 카드**

- single-flight
- latest-request coalescing
- minimum interval validation
- inflight/backlog/latency metrics
- timeout·circuit breaker
- regression load test

**발표 대사**

> 왜 이렇게 판단했는지 열어보면 각 수정 항목이 방금 본 로그와 메트릭 근거에 연결되어 있습니다. AI 답변만 믿는 것이 아니라 근거를 확인한 뒤 진행합니다.

## 장면 22. Safe PR 복구를 시작한다

**화면**: 복구 후보 → Git Diff → Safe PR.

**진행 순서**

```text
복구 후보 선택
→ 위험도 확인
→ 영향 범위 확인
→ 변경 Diff
→ Safe PR 생성
→ 정적·부하 검증
→ Merge
→ GitOps Sync
→ Canary 재검증
→ Live rollout
→ 사후 검증
```

**발표 대사**

> AI가 서버를 몰래 바꾸지 않습니다. 제안은 Git Diff와 위험도, 영향 범위로 먼저 보이고, 사람이 확인한 뒤 Safe PR을 만듭니다. 변경·검증·승인·배포의 모든 단계가 기록됩니다.

**조작**

- diff 핵심 줄 펼침
- tests와 policy 표시
- `Safe PR 생성`
- dev/demo auto-merge 정책 또는 review-required 정책을 실제 workspace에 맞게 표시

## 장면 23. 전역 알림에서 복구 상태를 추적한다

**화면**: 우측 상단 notification → 확장 operation panel.

**발표 대사**

> 이제 다른 화면으로 이동해도 복구는 백그라운드에서 계속됩니다. 알림 하나가 단순 완료 메시지가 아니라 복구 작업의 현재 상태를 보여줍니다.

**상태 표현**

```text
코드 검증 중
→ Commit 생성
→ PR 생성
→ 정책 검사
→ Merge
→ GitOps Sync 대기
→ Canary 재검증
→ 방별 배포
→ 사후 검증
→ 완료
```

**실패 시 action**

- 실패 단계와 reason code
- Retry
- PR 열기
- 증거 보기
- 검증된 revision으로 되돌리기

**완료 증거**

- PR URL
- commit SHA
- merge SHA
- sync revision
- operation/audit ID

## 장면 24. 수정된 Canary가 같은 부하를 통과한다

**화면**: Workflow Canary node와 before/after metrics.

**발표 대사**

> 같은 봇 수와 같은 검증 시간으로 다시 시험합니다. 이번에는 snapshot 요청이 겹치지 않고, 저장 중 추가 요청은 하나로 합쳐집니다. 메모리는 안정 범위에 머물고 OOMKilled도 재발하지 않습니다.

**반드시 보일 증거**

- 동일 validation profile
- `snapshot_inflight <= 1`
- coalesced count
- stable memory
- restart 0
- error rate threshold 통과
- checksum 정상
- `PromotionApproved`

**전환 대사**

> 이제 검증된 버전을 실제 게임방에 배포하겠습니다. 이 순간이 무중단 구조를 보여주는 핵심입니다.

## 장면 25. 실제 게임방을 한 방씩 무중단 교체한다

**화면**: Release Workflow와 물리 보기, PiP를 동시에 유지.

**발표 대사**

> 방 하나는 여전히 하나의 활성 게임 Pod가 처리합니다. 다만 배포 순간에만 같은 방의 후보 Pod가 잠시 생깁니다. 후보가 기존 상태와 입력을 모두 따라잡고 검증을 통과한 뒤, 브라우저가 연결된 중간 문인 Session Gateway가 내부 연결만 바꿉니다.

**room-0 한 개를 천천히 시연**

1. `RoomCandidateScheduled`
2. Candidate 회색 생성
3. `RoomCandidateReady`
4. full snapshot seed
5. snapshot 이후 journal catch-up
6. active/candidate server tick 간격 감소
7. checksum match
8. 새 room epoch fencing
9. Gateway upstream line old→candidate 전환
10. unacked input replay
11. session·metric post verify
12. old Pod drain

**발표 대사**

> 브라우저에서 Gateway로 이어진 초록 선은 한 번도 끊기지 않습니다. 내부의 Gateway→게임 Pod 선만 새 후보로 이동합니다. 위치·체력·팀·점수·인벤토리와 아직 처리되지 않은 입력까지 이어졌고, 확인이 끝난 뒤에만 기존 Pod가 종료됩니다.

**나머지 방**

- room-1→room-4는 속도를 높여 wave로 보여준다.
- 한 방 검증이 끝나야 다음 방으로 이동한다.
- 실패한 방이 있으면 전체 wave를 멈추고 기존 Active를 유지한다.

**PiP 증거**

- 페이지 reload 0
- downstream WebSocket close 0
- room ID 유지
- session hash 유지
- player state checksum 일치
- 입력 loss/duplicate 0

## 장면 26. 무중단이 가능했던 이유를 Workflow로 설명한다

**화면**: 전체 DAG를 확대.

**발표 대사**

> 게임이 끊기지 않은 이유는 단순히 Pod를 여러 개 띄웠기 때문이 아닙니다. 새 서버가 준비됐는지, 기존 상태를 복원했는지, 최신 입력까지 따라왔는지, 상태가 같은지 확인하기 전에는 연결을 바꾸지 않습니다. 바꾼 뒤에도 건강 상태를 다시 확인하고 그제야 이전 서버를 종료합니다.

**비개발자 비유**

> 새 상담원이 왔다고 기존 상담원을 바로 퇴근시키는 것이 아닙니다. 현재 통화 내용과 고객 요청을 모두 넘겨받고, 새 상담원이 같은 내용을 알고 있는지 확인한 뒤 전화선의 내부 담당자만 바꾸는 것과 같습니다.

**Workflow node 전체**

```text
Git 변경
→ Manifest Render
→ Policy
→ Canary
→ 검증 부하
→ Metric Gate
→ 승인
→ Candidate
→ Snapshot Seed
→ Journal Catch-up
→ Checksum
→ Gateway Cutover
→ Input Replay
→ Verify
→ Old Pod Drain
→ Next Room
→ Post Verify
```

## 장면 27. 복구 전후를 비교한다

**화면**: Compare와 Incident Timeline.

**발표 대사**

> 처음 위험 변경과 최종 수정 버전을 나란히 보겠습니다. 설정만 원복한 것이 아니라, 같은 문제가 다시 생기지 않도록 snapshot 처리 구조와 관측 지표, 회귀 테스트가 함께 추가됐습니다.

**Compare 항목**

- Git diff
- snapshot interval validation
- single-flight/coalescing
- memory before/after
- restart before/after
- p95 snapshot duration
- live session continuity

**Timeline 항목**

- risky commit
- Canary ready
- backlog
- OOMKilled
- promotion blocked
- Evidence Bundle
- Safe PR
- merge SHA
- revalidation pass
- room waves
- post verification

## 장면 28. 같은 버전을 다른 클러스터에 확산한다

**화면**: Workspace 범위 Release Flow. `game-server` 완료 후 `demo-server`.

**발표 대사**

> 검증된 같은 버전을 데모 서버 묶음에도 적용해보겠습니다. 워크스페이스가 가장 큰 범위이고, 그 아래 여러 클러스터가 있기 때문에 하나의 정책과 증거 흐름으로 대상을 확장할 수 있습니다.

**조작**

- target `demo-server` 추가
- permission·readiness
- sync
- smoke
- health
- 완료

**반드시 보일 증거**

- 동일 merge SHA
- 클러스터별 sync revision·health
- 대상별 operation state
- 실패 시 다른 클러스터와 격리

**논리 주의**

- management-server는 관측하되 일반 변경 대상에 포함하지 않는다.
- cluster별 권한과 capability를 무시해 일괄 실행하지 않는다.

## 장면 29. 전체 감사와 재현 가능성을 보여준다

**화면**: Timeline/Replay/Audit.

**발표 대사**

> 마지막으로 누가 무엇을 바꿨고, 어떤 증거로 차단했고, 어떤 수정이 승인됐으며, 어느 서버 묶음에 어떤 순서로 반영됐는지 모두 다시 확인할 수 있습니다. 문제가 생겼을 때 기억에 의존하지 않고 같은 기록으로 재현할 수 있습니다.

**증거**

- actor
- audit ID
- correlation/causation chain
- PR·commit·merge
- command receipt
- cluster/namespace/resource
- evidence bundle
- rollout wave
- post-verification

## 장면 30. 결론

**화면**: 홈으로 돌아와 정상 상태, Incident resolved, 두 cluster health, PiP 유지.

**발표 대사**

> 오늘 처음 보는 라이브 게임을 Agent 한 번으로 연결했습니다. 서버와 게임방 구조를 확인하고, Git을 기준으로 방을 늘렸습니다. 위험한 변경은 실제 사용자에게 도달하기 전 Canary가 찾아냈고, Opsia는 Git 변경·Kubernetes Event·메트릭·서비스 로그·트래픽을 같은 시간축으로 연결해 원인을 설명했습니다.
>
> 수정은 Safe PR로 검증·기록됐고, 실제 게임방은 사용자 연결과 상태를 유지한 채 한 방씩 새 버전으로 교체됐습니다. 마지막에는 같은 정책을 다른 서버 묶음까지 확장했습니다.
>
> 그래서 Opsia는 Kubernetes를 잘 아는 사람만을 위한 복잡한 도구가 아니라, **무엇이 실행되고 있는지 보고, 왜 문제가 생겼는지 이해하고, 검증된 방법으로 안전하게 고치도록 돕는 하나의 운영 흐름**입니다.

## 4. 동적 UI 연출 체크리스트

| 연출 | 장면 | 합격 기준 |
|---|---:|---|
| 연결 단계 실시간 완료 | 2~3 | 단계별 실제 event에 반응 |
| Cluster→Node→Pod 확대 | 5 | 위치 관계 유지, 레이아웃 shift 없음 |
| Pod 생성 상태색 | 9 | scheduled→initializing→ready |
| 부하 상태색 | 14 | metric threshold에 따른 실제 색 |
| Traffic 선 굵기 | 17 | 실제 req/s에 비례 |
| 오류 경로 강조 | 17 | Canary 오류만 빨강 |
| 실시간 Alert | 14~15 | 중복 알림은 Incident로 묶임 |
| Replay scrub | 16 | timestamp frame과 event 정합 |
| 로그 핵심 문장 강조 | 18 | 실제 structured log field 사용 |
| RCA 증거 충족률 | 19 | evidence 추가에 따라 변함 |
| Safe PR 전역 진행 알림 | 22~24 | 화면 이동 후에도 유지 |
| Active/Candidate handoff | 25 | 같은 방 안에서 표현, 방 수 불변 |
| Gateway edge 전환 | 25 | downstream 고정, upstream만 전환 |
| PiP 지속 | 7~30 | reload/close 0 증거 |
| 복구 전후 Compare | 27 | revision과 metric 근거 |
| 멀티클러스터 wave | 28 | cluster별 단계·실패 격리 |

## 5. 발표 중 사용하면 안 되는 표현

| 금지 표현 | 이유 | 대신 사용할 표현 |
|---|---|---|
| CPU 알림이 Pod를 늘렸습니다 | Alert와 scaling 책임 혼동 | 확장 정책이 늘렸고 Alert가 알려줬습니다 |
| 트래픽을 보니 원인이 확정됐습니다 | Traffic은 범위 축소 증거 | 트래픽으로 병목 범위를 좁혔습니다 |
| AI가 알아서 서버를 고쳤습니다 | 권한·감사·승인 흐름 왜곡 | AI가 근거 있는 수정안을 제안했고 사람이 확인했습니다 |
| room-1이 죽자 room-2가 대신했습니다 | 서로 다른 독립 게임방 | 위험 버전은 Canary에서 차단됐습니다 |
| 모든 장애에서 절대 끊기지 않습니다 | 보장 범위 과장 | 계획된 게임 Pod 교체에서 연결과 상태를 유지합니다 |
| replicas를 3에서 5로 바꿨습니다 | 현재 room profile·routing 논리 누락 | desired room policy를 3에서 5로 바꿨습니다 |
| 화면을 되감아 재현했습니다 | 실제 데이터 여부 불명확 | 스트리밍으로 보존한 과거 frame과 event를 재생했습니다 |

## 6. 라이브 데모 실패 시 정직한 대응

### Agent 연결이 늦을 때

> 현재 heartbeat는 연결됐고 inventory 수집 단계입니다. Opsia는 준비되지 않은 상태를 연결 완료로 꾸미지 않고 어떤 단계가 남았는지 보여줍니다.

### Metric·Log provider가 늦을 때

> Kubernetes 상태는 수집됐지만 metric/log provider는 아직 수집 중입니다. 없는 데이터를 0으로 표시하지 않고 현재 가능한 증거만 구분합니다.

### Canary OOM이 정해진 시간 안에 안 날 때

- 가짜 OOM event를 만들지 않는다.
- 실제 backlog·memory 상승까지만 설명한다.
- 사전 검증된 동일 실행의 Evidence Bundle과 Replay를 연다.

> 지금 실행에서는 한도에 도달하기 전이지만 snapshot 적체와 메모리 증가 조건은 관측됐습니다. 동일 조건으로 완료된 검증 기록을 열어 종료 원인까지 확인하겠습니다.

### Candidate handoff가 실패할 때

> Candidate가 상태 일치 검증을 통과하지 못해 연결을 바꾸지 않았습니다. 실패를 숨기지 않고 기존 게임방을 유지하는 것이 이 안전 장치의 목적입니다.

### Git provider가 늦을 때

> 작업은 operation ID로 계속 진행되고 있습니다. 화면을 닫아도 사라지지 않으며 알림과 Timeline에서 다시 열 수 있습니다.

## 7. 최종 발표 검증표

- [ ] 모든 숫자가 실제 API·metric·event에서 왔다.
- [ ] room=active Pod, Candidate≠새 방이 전 화면에서 일치한다.
- [ ] Canary와 live target이 시각·데이터·권한상 구분된다.
- [ ] OOMKilled는 실제 Kubernetes evidence다.
- [ ] Git 변경이 장애보다 먼저이고 로그·메트릭 순서가 일치한다.
- [ ] Replay frame timestamp와 event timestamp가 일치한다.
- [ ] Safe PR 진행 알림이 event 순서대로 갱신된다.
- [ ] PR URL·commit·merge·sync·resourceVersion·audit ID가 남는다.
- [ ] planned handoff에서 downstream WebSocket close 0이다.
- [ ] player state와 input continuity 검증이 통과한다.
- [ ] management-server는 보이지만 변경 권한이 제한된다.
- [ ] game-server와 demo-server는 Workspace 아래 독립 대상이다.
- [ ] UI가 없는 데이터를 0·정상·unknown으로 꾸미지 않는다.
- [ ] 발표 마지막에 Incident resolved와 post verification 완료가 보인다.
