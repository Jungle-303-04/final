# Debug Lab

실제 kind Kubernetes와 Gateway를 관측/조작하는 내부 디버그 도구입니다.
제품 UI와 분리되어 있으며, `src/` 코드를 사용하지 않습니다.

## 실행

```bash
cd /Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final
python3 debug-lab/server.py --port 19090
```

브라우저:

```text
http://localhost:19090
```

## 하는 일

- `kind-management`, `kind-target` 실제 Kubernetes API를 `kubectl`로 읽습니다.
- node, deployment, replicaset, pod, job, endpoint, readiness를 표시합니다.
- `debug-lab` 네임스페이스에 더미 workload를 생성합니다.
  - `demo-checkout`
  - `demo-payments`
- 실제 Kubernetes 명령으로 스케일/롤링재시작/pod 삭제/장애 주입을 실행합니다.
- Gateway `http://localhost:18080/healthz`, `/readyz` 상태도 같이 표시합니다.

## 안전 범위

- 더미 workload는 `debug-lab` 네임스페이스에만 생성됩니다.
- management/target 클러스터의 기존 서비스 상태는 읽기만 합니다.
- 버튼 액션은 선택한 클러스터의 `debug-lab` 네임스페이스 내 workload에만 적용됩니다.

## 더미 workload 장애 주입

- Pod scale: `0 / 1 / 3 / 10 / 30`
- rolling restart
- pod delete
- image revision rollout
- readiness fail/restore
- crashloop on/off
- delay on/off
- CPU load on/off
- memory load on/off
