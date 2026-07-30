#!/usr/bin/env bash
set -euo pipefail

uv run ruff check .
uv run python -m compileall -q src scripts
uv run pytest -q
