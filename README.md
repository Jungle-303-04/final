# SW AI Final

FastAPI 기반 백엔드 프로젝트입니다. 로컬 개발은 PyCharm과 `uv`, 배포 실습은 Docker 위 `kind` Kubernetes로 맞춥니다.

## Quick Start

```bash
uv sync
cp .env.example .env
bash scripts/dev.sh
```

API:

- App: `http://localhost:8000`
- Docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/healthz`

## Local Kubernetes

```bash
bash scripts/doctor.sh
bash scripts/k8s-up.sh
bash scripts/deploy-local.sh
bash scripts/k8s-status.sh
```

Kubernetes URL:

- App: `http://localhost:18090`

## Cleanup

```bash
bash scripts/k8s-down.sh
```

## Docs

- `docs/setup-mac.md`
- `docs/setup-windows-wsl.md`
- `docs/ide-pycharm.md`
- `docs/ide-intellij.md`
