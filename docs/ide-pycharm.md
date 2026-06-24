# PyCharm Setup

권장 IDE는 PyCharm Professional입니다.

1. `File > Open`에서 이 repo를 엽니다.
2. Python interpreter를 `.venv/bin/python`으로 설정합니다.
3. Terminal에서 `uv sync`를 실행합니다.
4. FastAPI 실행은 Terminal에서 `bash scripts/dev.sh`를 사용합니다.

Run Configuration을 만들고 싶다면:

- Type: Python
- Module: `uvicorn`
- Parameters: `app.main:app --reload --host 0.0.0.0 --port 8000`
- Working directory: repo root

Docker/Kubernetes는 PyCharm UI에 묶지 말고 `scripts/` 명령을 표준으로 사용합니다.
