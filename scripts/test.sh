#!/usr/bin/env bash
set -euo pipefail

uv run ruff check services/eda_platform tests
uv run pytest -q
