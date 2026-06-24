SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

CLUSTER_NAME ?= final-kubernetes
IMAGE_NAME ?= final-api:local
DEV_URL ?= http://localhost:8000
APP_URL ?= http://localhost:18090
COMPOSE_FILE ?= deploy/docker/compose.yaml
DOCKER_COMPOSE := docker compose --env-file .env -f $(COMPOSE_FILE)

export CLUSTER_NAME
export IMAGE_NAME

.PHONY: help setup env sync doctor dev lint format test check docker-build docker-up docker-dev docker-test docker-shell docker-logs docker-down build-image k8s-up k8s-deploy k8s-status k8s-down k8s up status down api-health api-ping urls open-docs clean

help: ## 사용 가능한 공통 명령어 출력
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: env sync ## 최초 개발 환경 준비

env: ## .env 파일 생성
	@if [[ -f .env ]]; then \
		echo ".env already exists"; \
	else \
		cp .env.example .env; \
		echo "created .env"; \
	fi

sync: ## Python 의존성 설치/동기화
	uv sync

doctor: ## 로컬 필수 도구 점검
	bash scripts/doctor.sh

dev: ## FastAPI 개발 서버 실행
	bash scripts/dev.sh

lint: ## Ruff 린트 검사
	uv run ruff check .

format: ## Ruff 포맷 적용
	uv run ruff format .

test: ## 린트와 테스트 실행
	bash scripts/test.sh

check: doctor test ## 개발 전/커밋 전 전체 점검

docker-build: env ## Docker 개발 이미지 빌드
	$(DOCKER_COMPOSE) build api

docker-up: env ## Docker 개발 서버 백그라운드 실행
	$(DOCKER_COMPOSE) up -d api

docker-dev: env ## Docker 개발 서버 포그라운드 실행
	$(DOCKER_COMPOSE) up api

docker-test: env ## Docker 안에서 린트와 테스트 실행
	$(DOCKER_COMPOSE) run --rm api bash scripts/test.sh

docker-shell: env ## Docker 개발 컨테이너 셸 접속
	$(DOCKER_COMPOSE) run --rm api bash

docker-logs: env ## Docker 개발 서버 로그 확인
	$(DOCKER_COMPOSE) logs -f api

docker-down: env ## Docker 개발 서버 종료
	$(DOCKER_COMPOSE) down

build-image: ## 로컬 Docker 이미지 빌드
	bash scripts/build-image.sh

k8s-up: ## kind Kubernetes 클러스터 생성/선택
	bash scripts/k8s-up.sh

k8s-deploy: ## Kubernetes에 로컬 이미지 배포
	bash scripts/deploy-local.sh

k8s-status: ## Kubernetes 리소스 상태 확인
	bash scripts/k8s-status.sh

k8s-down: ## kind Kubernetes 클러스터 삭제
	bash scripts/k8s-down.sh

k8s: k8s-up k8s-deploy k8s-status ## Kubernetes 전체 실행

up: k8s ## Kubernetes 전체 실행 별칭

status: k8s-status ## 상태 확인 별칭

down: k8s-down ## 클러스터 삭제 별칭

api-health: ## Kubernetes API health 확인
	@curl -fsS "$(APP_URL)/healthz"
	@printf "\n"

api-ping: ## Kubernetes API ping 확인
	@curl -fsS "$(APP_URL)/api/v1/ping"
	@printf "\n"

urls: ## 로컬 접속 URL 출력
	@printf "Dev API:      %s\n" "$(DEV_URL)"
	@printf "Dev Docs:     %s/docs\n" "$(DEV_URL)"
	@printf "K8s API:      %s\n" "$(APP_URL)"
	@printf "K8s Docs:     %s/docs\n" "$(APP_URL)"
	@printf "K8s Health:   %s/healthz\n" "$(APP_URL)"

open-docs: ## API 문서 브라우저 열기
	@url="$(APP_URL)/docs"; \
	if [[ "$$(uname -s)" == "Darwin" ]]; then \
		open "$$url"; \
	elif command -v wslview >/dev/null 2>&1; then \
		wslview "$$url"; \
	elif command -v cmd.exe >/dev/null 2>&1; then \
		cmd.exe /C start "" "$$url" >/dev/null 2>&1; \
	elif command -v xdg-open >/dev/null 2>&1; then \
		xdg-open "$$url" >/dev/null 2>&1; \
	else \
		echo "$$url"; \
	fi

clean: ## Python 캐시와 테스트 캐시 삭제
	rm -rf .pytest_cache .ruff_cache
	find app tests -type d -name __pycache__ -prune -exec rm -rf {} +
	find . -name .DS_Store -delete
