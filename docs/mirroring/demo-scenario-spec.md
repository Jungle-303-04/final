---
title: Opsia 데모 마스터 시나리오 · 동적 연출 · 논리 정합 스펙
status: canonical-v1
date: 2026-07-20
author: choi woo-nyong
purpose: 데모(front·devpreview) 개발의 단일 기준. 발표 흐름·연출·장애 시나리오·논리 교정을 고정한다.
---

# Opsia 데모 마스터 시나리오 스펙

> 이 문서는 데모 디벨롭의 **정본**이다. 데모(front)와 dev 미러링은 모두 이 흐름·논리를 따른다.
> 핵심 원칙: 화면이 존재하는가가 아니라 **논리적 인과와 증거 흐름이 맞는가**로 판정한다.

## 0. 반드시 지킬 논리 정합 (연출보다 우선)

1. **CPU 알림은 알림일 뿐, 파드를 늘리지 않는다.** 알림은 상태 통지. 증설은 별도의 자동 확장 정책(HPA)이 담당.
2. **트래픽 화면은 원인 확정 화면이 아니라 병목 위치를 좁히는 화면.**
3. **롤백 전에 장애 시점의 메트릭·로그·이벤트·Git 변경을 증거로 보존**한다(보존 후 롤백해도 분석 지속).
4. **무중단은 "워크플로가 있어서"가 아니라 조건이 함께 충족돼야 가능**하다:
   - 준비(Readiness) 완료된 파드에만 트래픽 전달
   - 새 파드를 먼저 생성(maxSurge)
   - 기존 파드는 연결 정리 후 종료(graceful drain)
   - 최소 가용 개수 유지(maxUnavailable: 0)
   - 실패 시 배포 중단·롤백
5. **CPU·트래픽은 최초 원인이 아니라 OOMKilled 이후의 2차 증상**임을 시간축으로 보여준다.

## 1. 정본 장애 시나리오 — 메모리 제한 축소로 인한 OOMKilled

선정 이유: Git 변경↔장애 인과가 명확 · Pod 색상/메트릭/Event/로그/트래픽 전부 활용 · CPU 경고가 2차 증상임을 보여줌 · 롤백·Safe PR 복구가 자연스러움 · 비전문가도 "메모리를 너무 작게 잡아 게임방 서버가 강제 종료됐다"로 이해.

**정상 상태**
```yaml
resources:
  requests:
    memory: 256Mi
  limits:
    memory: 512Mi
```

**장애 유도 변경**
```yaml
resources:
  requests:
    memory: 96Mi
  limits:
    memory: 128Mi
```
저부하에선 정상처럼 보이나, 봇 증가로 게임방 상태 캐시가 커지며 128Mi 한도를 초과.

**하나의 시간축(정본 타임라인)**
```
14:02  Git 변경 반영: memory limit 512Mi → 128Mi
14:03  봇 증가: 동시 사용자 80 → 450
14:04  Pod 메모리 126Mi 도달
14:04  컨테이너 OOMKilled, 재시작 1회
14:05  남은 Pod로 트래픽 집중
14:05  CPU 70% 초과 알림 발생
14:06  재시도 증가, 응답 지연·5xx 발생
14:07  Incident 생성 및 증거 묶음 보존
```

**로그(흐름 일치)**
```
room-cache entries=18420 estimated_memory=118Mi
memory pressure detected: heap_usage=124Mi limit=128Mi
matchmaking request delayed: room-state lookup timeout
SIGKILL detected from container runtime
```

**Kubernetes Event**
```
Reason: OOMKilled
Container exceeded memory limit: 128Mi
Restart count: 3
```

**트래픽 증거**
```
match-gateway → room-server 요청 재시도 4.2배 증가
정상 Pod 2개로 트래픽 집중
응답 지연 p95: 180ms → 2.1s
```

**반대(제거) 증거 — 대안 원인 소거로 "RCA처럼" 보이게**
```
Redis 연결 상태 정상
Node 가용 메모리 정상
NetworkPolicy 변경 없음
외부 네트워크 Drop 없음
```

## 2. 발표·데모 17단계 흐름

1. **인수 상황(홈)** — 워크스페이스·멀티클러스터(Management/Game/Demo)·연결/관측 상태·노드/Pod/앱/인시던트 요약.
2. **게임 서버 연결(클러스터 연결 위저드)** — EKS 선택 → `game-server` → production → 설치 명령 생성/복사 → 터미널 → 연결 대기 → Heartbeat → Inventory 수집 → Ready. (Agent는 outbound push, 방화벽 인바운드 불필요.)
3. **서버 구조 이해(리소스 → 물리 보기)** — Cluster→Node→Pod, Node CPU/메모리, 게임방/Gateway/Redis Pod, 색상 상태, 확대/축소/필터. 게임방 Pod 클릭 → 이름·상태·Ready·이미지·CPU·메모리·재시작·소유 Deployment·최근 Event·로그·YAML·관련 리소스.
4. **실제 게임 접속(Service 상세 → 서비스 접근)** — 서비스 주소 → game.woonyong.org → 게임방 수/플레이어 → PiP 관제 유지.
5. **Git 저장소 연결(배포 → 저장소 연결)** — URL 입력 → Provider 자동 인식 → 인증 → Probe → Branch → Manifest 경로 → 유효성 → 완료. Repository/Branch/Manifest/GitOps App/Revision/Sync·Health.
6. **첫 정상 변경: 게임방 증설(리소스 상세 → YAML)** — `replicas: 3 → 5`, 구문검증 → Diff → 영향 → 저장·배포 → Commit·PR → Merge → GitOps Revision 감지 → Pod 2개 생성 대기 → Ready. 물리 보기: 점선/회색 대기 → 파랑 초기화 → 초록 Ready. 게임: 방 3→5.
7. **부하 증가(게임 관제 + 물리 보기)** — 봇 80→200→450, 실시간 메트릭·Pod 색상(초록→주황)·현재/평균/최대·HPA 현재/목표·트래픽 요청률·자동 확장.
8. **AI로 알림 규칙 생성(AI 패널)** — "CPU 70% 5분 초과 시 높은 심각도 알림". AI가 대상/지표/조건/지속/심각도/채널을 보여주고 **확인 후 적용**. (주의: 알림은 통지, 증설은 HPA.)
9. **장애 유도(2번째 변경)** — `512Mi → 128Mi` Git 반영 → 봇 증가 → 메모리 상승 → OOMKilled → 재시작 → 남은 Pod 집중 → CPU 70% 알림.
10. **트래픽으로 범위 좁히기(리소스 → 트래픽)** — Gateway→Room 흐름, 정상/경고/오류 색상, 재시도, 요청률/오류율, 특정 Pod 집중, Redis 정상. "CPU는 최초 원인 아님".
11. **인시던트 생성·RCA(알림 센터 → 인시던트 상세)** — 증상→발생시각→영향서비스→사용자영향→최근변경→메트릭→Event→로그→트래픽→원인후보→반대증거→최종 RCA. 핵심 장면: **서로 다른 증거가 같은 결론으로 수렴**.
12. **즉시 롤백(서비스 보호)** — 증거 보존됨 전제 → 이전 Revision 선택 → Diff → 영향 → 롤백 → Operation Event → 새 Pod 준비 → 장애 Pod 제거 → 재관측.
13. **로그 상세 조사 + AI 설명** — "CPU 알림인데 왜 메모리가 원인?": CPU 경고는 OOMKilled 이후 발생 / 메모리 변경이 장애 직전 Git / OOMKilled는 직접 증거 / Node·Redis 정상 / 트래픽 집중은 종료 이후 → CPU·트래픽은 2차 증상. 후속: "최소 변경 복구안".
14. **Safe PR 복구** — 후보 선택 → 위험도 → 영향 → Diff → Safe PR → 검증 → Merge → GitOps Sync → Rollout → 사후검증. 증거: PR URL·Commit SHA·Merge SHA·Sync Revision·ResourceVersion·Audit ID·정상 메트릭·재시작 중단·오류율 감소. (AI가 몰래 바꾼 게 아니라 사람 확인 후 GitOps 절차.)
15. **무중단 확인(게임 PiP + Rollout)** — Readiness 전 트래픽 차단 · maxUnavailable:0 · maxSurge:1 · 최소 Ready 시간 · 단계 검증 · 오류율 기준 · 자동 중단 · Rollback 정책 · 연결 종료 유예 · 배포 후 건강 확인. 비유: 새 직원 투입·확인 후 기존 직원 교대.
16. **다른 클러스터로 확장(배포 → Release Flow)** — `demo-server` 추가 → Staging → Readiness → 배포 → 건강 → 다음 대상 → 멀티클러스터 상태 비교. 동일 Git Revision·대상별 단계·클러스터별 Sync/Health·Pause/Resume/Retry·실패 시 Rollback·전체 감사.
17. **마무리** — 연결·관측·분석·복구·배포를 하나의 흐름으로. 메트릭 하나가 아니라 Git·Event·로그·트래픽을 같은 시간축으로 연결해 원인 규명, 검증된 복구를 GitOps로 반영해 무중단 복구, 동일 정책을 타 클러스터로 확장.

## 3. 동적 연출 목록 (메인 스토리 방해 없는 범위)

우선순위는 시나리오 단계와의 결합도 순.

| # | 연출 | 결합 단계 | 비고 |
|---|------|-----------|------|
| D1 | 클러스터 연결 단계 실시간 완료 애니메이션 | 2 | 위저드 단계 진행 |
| D2 | Node → Pod 확대 물리 보기 | 3 | 줌 인터랙션 |
| D3 | Pod 생성 시 점선 → 준비중 → 정상 색 전환 | 6 | 증설 |
| D4 | 봇 증가에 따라 Pod 색 초록→주황→빨강 | 7,9 | 부하 |
| D5 | Traffic 선 굵기 = 요청률 | 7,10 | |
| D6 | 오류 흐름만 빨강 강조 | 10 | |
| D7 | Alert 우측 상단 실시간 등장 | 7,9 | |
| D8 | 인시던트가 여러 알림을 하나로 묶는 애니메이션 | 11 | |
| D9 | Timeline에 Git 변경과 OOMKilled 시점 나란히 | 11 | |
| D10 | 로그 스트림 핵심 문장 자동 강조 | 11,13 | |
| D11 | RCA 후보 증거 충족률 변화 | 11 | |
| D12 | 복구 단계 제안→승인→배포→검증→완료 진행 | 14 | |
| D13 | PiP 게임 화면 상시 노출(무중단 시각 증명) | 4,15 | |
| D14 | 복구 전후 리소스 Compare | 14,15 | |
| D15 | 워크스페이스 전체로 배포 확산 상태 표현 | 16 | |

## 4. 개발 원칙

- 데모는 **디자인·인터랙션 정본**(fixture 허용), dev는 동일 UI를 실제 계약에 바인딩(가짜값 금지, 없으면 "미관측").
- 모든 연출은 위 논리 정합(0절)을 위반하지 않는다. 특히 CPU 알림→증설 연결 금지, 롤백 전 증거 보존 표현 필수.
- 시간축·로그·Event·트래픽 수치는 1절 정본과 **완전히 일치**시킨다(관객이 교차 검증 가능하도록).
- 각 연출/단계는 미러 원장(mirror-ledger.json)에 등록하고 계약 정합 체커로 검증.
