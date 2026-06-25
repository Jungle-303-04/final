#!/usr/bin/env bash
set -euo pipefail

uv run ruff check services packages tests
uv run pytest -q
