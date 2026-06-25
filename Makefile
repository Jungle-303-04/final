SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

IMAGE_NAME ?= service:local
MGMT_CLUSTER ?= management
TARGET_CLUSTER ?= target
ENV_TEMPLATE ?= config/env/app.env.example

export IMAGE_NAME
export MGMT_CLUSTER
export TARGET_CLUSTER

.PHONY: help setup env sync doctor lint format test check build-image up down status smoke scale kill-pod clean

help: ## 사용 가능한 명령어 출력
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: env sync ## 최초 개발 환경 준비

env: ## .env 파일 생성
	@if [[ -f .env ]]; then \
		echo ".env already exists"; \
	else \
		cp "$(ENV_TEMPLATE)" .env; \
		echo "created .env"; \
	fi

sync: ## Python 의존성 설치/동기화
	uv sync

doctor: ## 로컬 필수 도구 점검
	bash scripts/doctor.sh

lint: ## Ruff 린트 검사
	uv run ruff check services packages tests

format: ## Ruff 포맷 적용
	uv run ruff format services packages tests

test: ## 린트와 테스트 실행
	bash scripts/test.sh

check: doctor test ## 개발 전/커밋 전 전체 점검

build-image: ## service Docker 이미지 빌드
	bash scripts/build-image.sh

up: ## management/target kind 클러스터 실행
	bash scripts/up.sh

down: ## management/target kind 클러스터 삭제
	bash scripts/down.sh

status: ## management/target 리소스 상태 확인
	bash scripts/status.sh

smoke: ## 전체 이벤트 사이클 smoke 테스트
	bash scripts/smoke.sh

scale: ## management worker scale. 예: make scale DEPLOYMENT=rca-worker REPLICAS=2
	@test -n "$(DEPLOYMENT)" && test -n "$(REPLICAS)"
	bash scripts/scale.sh "$(DEPLOYMENT)" "$(REPLICAS)"

kill-pod: ## management pod 삭제 후 복구 확인. 예: make kill-pod DEPLOYMENT=rca-worker
	@test -n "$(DEPLOYMENT)"
	bash scripts/kill-pod.sh "$(DEPLOYMENT)"

clean: ## Python 캐시 삭제
	rm -rf .pytest_cache .ruff_cache
	find services packages tests -type d -name __pycache__ -prune -exec rm -rf {} +
	find . -name .DS_Store -delete
