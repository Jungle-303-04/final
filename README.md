# Project K

FastAPI 기반 백엔드 프로젝트입니다. 팀원은 macOS와 Windows WSL에서 같은 명령으로 개발하고, Docker Compose와 로컬 Kubernetes(kind)에서 동일한 API 동작을 확인합니다.

## 처음 클론한 뒤

```bash
make setup
make check
```

`make setup`은 `config/env/app.env.example`을 기준으로 `.env`를 만들고 Python 의존성을 동기화합니다.

## 개발할 때

빠른 API 개발은 Docker Compose를 기본으로 씁니다.

```bash
make docker-up
make docker-logs
make docker-down
```

접속:

- API: `http://localhost:8000`
- Docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/healthz`
- Ready: `http://localhost:8000/readyz`
- Metrics: `http://localhost:8000/metrics`

로컬 Python으로 바로 실행해야 할 때만 씁니다.

```bash
make dev
```

## Kubernetes에서 확인할 때

Docker 위에 kind 클러스터를 만들고 API를 배포합니다.

```bash
make k8s
make status
make k8s-smoke
```

접속:

- API: `http://localhost:18090`
- Docs: `http://localhost:18090/docs`
- Health: `http://localhost:18090/healthz`

정리:

```bash
make down
```

## 팀 작업 흐름

1. `dev`를 최신으로 받습니다.
2. `user/<nickname>/<task>` 브랜치를 만듭니다.
3. 작업 후 `make check`와 필요한 smoke 테스트를 실행합니다.
4. Pull Request를 `dev`로 보냅니다.
5. `dev`에서 충분히 검증되면 `main`으로 Pull Request를 보냅니다.

자세한 규칙은 [docs/team-workflow.md](docs/team-workflow.md)를 봅니다.

## 주요 명령어

```bash
make help
make setup
make check
make smoke

make docker-up
make docker-test
make docker-smoke
make docker-down

make k8s
make k8s-smoke
make status
make down
```

## 문서

- [docs/team-workflow.md](docs/team-workflow.md)
- [docs/api-guidelines.md](docs/api-guidelines.md)
- [docs/database.md](docs/database.md)
- [docs/secrets.md](docs/secrets.md)
- [docs/environments.md](docs/environments.md)
- [docs/setup-mac.md](docs/setup-mac.md)
- [docs/setup-windows-wsl.md](docs/setup-windows-wsl.md)
- [docs/ide-pycharm.md](docs/ide-pycharm.md)
- [docs/ide-intellij.md](docs/ide-intellij.md)
