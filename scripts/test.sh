#!/usr/bin/env bash
set -euo pipefail

uv run ruff check src scripts tests
uv run pytest -q
