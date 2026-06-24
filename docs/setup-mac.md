# macOS Setup

```bash
brew install uv kubectl kind
```

Docker Desktop을 실행한 뒤:

```bash
bash scripts/doctor.sh
uv sync
bash scripts/dev.sh
```

Kubernetes 로컬 실행:

```bash
bash scripts/k8s-up.sh
bash scripts/deploy-local.sh
```
