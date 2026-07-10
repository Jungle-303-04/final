#!/usr/bin/env bash
set -euo pipefail

uv run ruff check src scripts tests
uv run ruff format --check src scripts tests
PYTHONPATH=src uv run lint-imports --config .importlinter
uv run python -m compileall -q src scripts
uv run python -m pytest -q
