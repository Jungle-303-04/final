# 현재 서비스 상태

마지막 실측: 2026-07-10 23:23:41 KST

이 문서는 작업 중 기준선과 최종 배포 상태가 섞이지 않도록 현재 라이브 상태를 보존한다.
비밀값 원문은 기록하지 않는다. 변경을 배포한 뒤에는 같은 항목을 다시 측정해 이 문서를
갱신한다.

## 소스와 배포

- 권위 브랜치: `dev`
- 소스 HEAD: `072fbb249ae465450d3e35109fa20b9055a27d52`
- backend image:
  `kubernetes-ops-service@sha256:5e6724ffdbc1adc7716d66979169ba3963764b9a6b300dd23cde673adcf3d936`
- management backend: Deployment 38개, replica 39/39 Ready
- cluster-1 target agent: replica 1/1 Ready, management와 동일 digest
- console health: `{"status":"ok","service":"api-gateway"}`
- agent API health: `{"status":"ok","service":"api-gateway"}`

## 적체와 운영 데이터

- dead letter: 0
- outbox 미발행: 0
- consumer pending/ack/redelivered: 0/0/0
- evidence job: completed 1,079, 비종결 0
- agent command queued/leased/running: 0
- RCA timeline: `approval_recommended` 2
- recovery plan: `selection_requested` 1

RCA timeline과 recovery plan의 남은 행은 아래 골든 run의 감사 이력이다. 실제 장애·명령 적체는
없다. 최종 검증 뒤 운영 화면을 깨끗하게 초기화할 때 verification 증거를 별도 보존한 후 정리한다.

## RCA 골든 run

- run id: `1f1b2192-a15f-4346-931b-ff96355403c9`
- scenario: `image.wrong-tag`
- cluster: `cluster-1`
- 실제 root cause: `wrong_image_tag`
- evidence, RCA report, recovery plan: 완료
- action selection: 실행하지 않음
- 명시 cleanup: 완료
- sandbox Deployment/Service/Pod 잔여: 0

현재 catalog의 `ready` 표시는 다음 3개다.

- `image.wrong-tag`: 라이브 생성부터 plan, cleanup 잔여 0까지 검증
- `image.registry-down`: 라이브 전체 완주 미검증
- `schedule.affinity`: 라이브 전체 완주 미검증

따라서 현재 `ready`와 `live verified`의 의미가 일치하지 않는다. 최종 RCA 구조화 작업에서는
검증되지 않은 두 시나리오를 하향하거나 verification ledger로 두 상태를 명시적으로 분리한다.

## 다음 갱신 게이트

1. 전체 backend 테스트, Ruff, import-linter, manifest 렌더 통과
2. 최종 image digest로 management와 target rollout 완료
3. 같은 scenario를 연속 두 번 실행해 dedup 고착이 없음
4. expected root cause와 실제 report 불일치가 terminal failure로 노출됨
5. provider 실패가 strict evidence job의 재시도/실패로 노출됨
6. 생성, 관측, evidence, RCA, plan, cleanup과 잔여 0을 다시 확인
7. DLQ, outbox, consumer lag, 활성 command가 모두 0

