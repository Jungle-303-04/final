#!/usr/bin/env bash
set -euo pipefail

uv run ruff check service tests
uv run pytest -q
