SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

IMAGE_NAME ?= service:local
MGMT_CLUSTER ?=
TARGET_CLUSTER ?=
ENV_TEMPLATE ?= config/env/app.env.example
LOCAL_TEST_ENV ?= .env.local-test
FAST_TESTS ?= tests/test_dev_gate_contract.py
REFERENCE_REVISION ?= cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc
REFERENCE_UI_BASE_REVISION ?= 3ff2b1095151c690bf536e8e6ca685c2703fcd70
REFERENCE_UPSTREAM_GIT ?= /tmp/opsia-upstream-verify

export IMAGE_NAME
export MGMT_CLUSTER
export TARGET_CLUSTER
export REFERENCE_REVISION
export REFERENCE_UI_BASE_REVISION
export REFERENCE_UPSTREAM_GIT

.PHONY: help setup setup-hooks env local-test-env local-up local-smoke sync hooks doctor lint format test manifest-check reference-ledger reference-ledger-check reference-feature-ledger reference-feature-ledger-check reference-ui-delta-ledger reference-ui-delta-ledger-check reference-ui-delta-rebaseline-check reference-feature-parity-check gate gate-fast events event-bus-equivalence crash-test check build-image up install-telemetry down status smoke demo scale kill-pod external-instances external-kubeconfig cluster-interactions aws-up aws-down clean

help: ## 사용 가능한 명령어 출력
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: env sync setup-hooks ## 최초 개발 환경 준비

env: ## .env 파일 생성
	@if [[ -f .env ]]; then \
		echo ".env already exists"; \
	else \
		cp "$(ENV_TEMPLATE)" .env; \
		echo "created .env"; \
	fi

local-test-env: ## 로컬 smoke/Bruno 테스트용 .env.local-test 생성
	@if [[ -f "$(LOCAL_TEST_ENV)" ]]; then \
		echo "$(LOCAL_TEST_ENV) already exists"; \
	else \
		cp config/env/local-test.env.example "$(LOCAL_TEST_ENV)"; \
		echo "created $(LOCAL_TEST_ENV)"; \
	fi

sync: ## Python 의존성 설치/동기화
	uv sync

doctor: ## 로컬 필수 도구 점검
	bash scripts/doctor.sh

lint: ## Ruff 린트 검사
	uv run ruff check .

format: ## Ruff 포맷 적용
	uv run ruff format .

hooks: ## git 훅 설치(pre-commit 포맷 + pre-push 빠른 게이트)
	uv run pre-commit install --hook-type pre-commit --hook-type pre-push

setup-hooks: hooks ## 커밋 메시지·포맷·pre-push 게이트 훅 설치
	@hook_path="$$(git rev-parse --git-path hooks)/commit-msg"; \
	mkdir -p "$$(dirname "$$hook_path")"; \
	printf '%s\n' '#!/usr/bin/env sh' 'exec "$$(git rev-parse --show-toplevel)/scripts/commit-msg-gate.sh" "$$1"' > "$$hook_path"; \
	chmod +x "$$hook_path"; \
	echo "installed $$hook_path"

test: ## 린트와 테스트 실행
	bash scripts/test.sh

manifest-check: ## Kubernetes manifest 렌더/파싱 확인
	bash scripts/manifest-check.sh

reference-ledger: ## 고정 원본의 해시·이식 상태 ledger 생성
	node scripts/reference-ledger.mjs --source references/upstream --revision "$(REFERENCE_REVISION)" --output docs/migration/reference-source-ledger.json

reference-ledger-check: ## 고정 원본과 ledger의 완전성 확인
	node scripts/reference-ledger.mjs --source references/upstream --revision "$(REFERENCE_REVISION)" --output docs/migration/reference-source-ledger.json --check

reference-feature-ledger: ## 원본 기능·계약 전수 ledger 생성
	node scripts/reference-feature-ledger.mjs --source docs/spec/frontend/reference-feature-inventory.md --revision "$(REFERENCE_REVISION)" --output docs/migration/reference-feature-ledger.json --contracts-output src/packages/contracts/reference_feature_catalog.json --port-map docs/migration/reference-feature-port-map.json

reference-feature-ledger-check: ## 원본 기능 ledger의 완전성 확인
	node scripts/reference-feature-ledger.mjs --source docs/spec/frontend/reference-feature-inventory.md --revision "$(REFERENCE_REVISION)" --output docs/migration/reference-feature-ledger.json --contracts-output src/packages/contracts/reference_feature_catalog.json --port-map docs/migration/reference-feature-port-map.json --check

reference-ui-delta-ledger: ## 최신 원본 UI delta를 pending 상태로 결정적으로 생성
	node scripts/reference-source-delta-ledger.mjs --repository "$(REFERENCE_UPSTREAM_GIT)" --base "$(REFERENCE_UI_BASE_REVISION)" --target "$(REFERENCE_REVISION)" --inventory docs/spec/frontend/reference-feature-inventory.md --output docs/migration/reference-ui-delta-ledger.json

reference-ui-delta-ledger-check: ## UI delta의 path·blob·SHA-256 결정성 확인(분류 완료는 요구하지 않음)
	node scripts/reference-source-delta-ledger.mjs --repository "$(REFERENCE_UPSTREAM_GIT)" --base "$(REFERENCE_UI_BASE_REVISION)" --target "$(REFERENCE_REVISION)" --inventory docs/spec/frontend/reference-feature-inventory.md --output docs/migration/reference-ui-delta-ledger.json --check

reference-ui-delta-rebaseline-check: ## 출하/재기준화용: revision 일치와 UI delta 전수 분류를 모두 요구
	node scripts/reference-source-delta-ledger.mjs --repository "$(REFERENCE_UPSTREAM_GIT)" --base "$(REFERENCE_UI_BASE_REVISION)" --target "$(REFERENCE_REVISION)" --inventory docs/spec/frontend/reference-feature-inventory.md --output docs/migration/reference-ui-delta-ledger.json --check --require-rebased --require-classified

reference-feature-parity-check: reference-ui-delta-rebaseline-check ## 출하용: UI delta와 모든 제품 기능이 실제 구현 상태인지 확인
	node scripts/reference-feature-ledger.mjs --source docs/spec/frontend/reference-feature-inventory.md --revision "$(REFERENCE_REVISION)" --output docs/migration/reference-feature-ledger.json --contracts-output src/packages/contracts/reference_feature_catalog.json --port-map docs/migration/reference-feature-port-map.json --check --require-complete

gate: reference-ledger-check reference-feature-ledger-check ## CI용 백엔드·manifest·프론트 전체 게이트
	bash scripts/test.sh
	bash scripts/manifest-check.sh
	cd frontend && npm ci --include=dev --no-audit --no-fund
	cd frontend && npm run typecheck
	cd frontend && npm run lint
	cd frontend && npm test
	cd frontend && npm run build
	test -s frontend/dist/index.html
	ls frontend/dist/assets/*.js >/dev/null

gate-fast: ## pre-push용 빠른 정적 검사와 지정 변경 영역 테스트(FAST_TESTS로 선택)
	uv run ruff check .
	uv run ruff format --check .
	PYTHONPATH=src uv run lint-imports --config .importlinter
	uv run python -m compileall -q src scripts
	uv run pytest -q $(FAST_TESTS)
	@changed_files="$$(bash scripts/changed-files.sh)"; \
	if grep -Eq '^frontend/' <<<"$$changed_files"; then \
		base="$$(bash scripts/changed-files.sh --base)"; \
		if [[ ! -d frontend/node_modules ]] || grep -Eq '^frontend/(package.json|package-lock.json)$$' <<<"$$changed_files"; then \
			(cd frontend && npm ci --include=dev --no-audit --no-fund); \
		fi; \
		(cd frontend && npm run typecheck); \
		(cd frontend && npm run lint); \
		if grep -Eq '^frontend/(package.json|package-lock.json|vitest.config.[^/]+|vite.config.[^/]+|tsconfig[^/]*)$$' <<<"$$changed_files"; then \
			(cd frontend && npm test); \
		else \
			(cd frontend && npm test -- --changed "$$base"); \
		fi; \
	else \
		echo "[gate-fast] frontend 변경 없음 — 프론트 검사 생략"; \
	fi

events: ## 등록된 이벤트/구독자 한눈에 보기
	uv run python scripts/events.py

event-bus-equivalence: ## in-process/NATS 전송 결과 동등성 실측
	bash scripts/test-event-bus-equivalence.sh

services: ## 서비스 명부 한눈에 보기(src/services 자동 발견)
	uv run python scripts/services.py

check: gate ## 개발자·CI·pre-push 공통 전체 점검

build-image: ## 로컬 container image 빌드(수동 디버그용)
	bash scripts/build-image.sh

up: ## legacy local management/target cluster 실행(기본 테스트 아님)
	MGMT_CLUSTER="$${LOCAL_MGMT_CLUSTER:-management}" TARGET_CLUSTER="$${LOCAL_TARGET_CLUSTER:-target}" bash scripts/up.sh

local-up: ## .env.local-test를 source해서 로컬 management/target cluster 실행
	@test -f "$(LOCAL_TEST_ENV)" || { echo "missing $(LOCAL_TEST_ENV); run make local-test-env"; exit 1; }
	set -a; source "$(LOCAL_TEST_ENV)"; set +a; bash scripts/up.sh

install-telemetry: ## target 클러스터에 telemetry Helm charts 설치
	bash scripts/install-telemetry.sh

down: ## legacy local management/target cluster 삭제
	MGMT_CLUSTER="$${LOCAL_MGMT_CLUSTER:-management}" TARGET_CLUSTER="$${LOCAL_TARGET_CLUSTER:-target}" bash scripts/down.sh

status: ## AWS management/target 리소스 상태 확인
	bash scripts/status.sh

smoke: ## 현재 환경변수로 배포된 서비스 smoke 실행
	bash scripts/smoke.sh

demo: ## Kind에서 bad rollout → Safe PR 리뷰 병합 → 외부 GitOps 정상화 데모
	bash scripts/oss-demo.sh

local-smoke: ## .env.local-test를 source해서 로컬 smoke 실행
	@test -f "$(LOCAL_TEST_ENV)" || { echo "missing $(LOCAL_TEST_ENV); run make local-test-env"; exit 1; }
	set -a; source "$(LOCAL_TEST_ENV)"; set +a; bash scripts/smoke.sh

crash-test: ## AWS management에서 아웃박스 정확히 한 번 크래시 테스트
	bash scripts/crash_test.sh

scale: ## management worker 스케일 조정. 예: make scale DEPLOYMENT=rca-worker REPLICAS=2
	@test -n "$(DEPLOYMENT)" && test -n "$(REPLICAS)"
	bash scripts/scale.sh "$(DEPLOYMENT)" "$(REPLICAS)"

kill-pod: ## management pod 삭제 후 복구 확인. 예: make kill-pod DEPLOYMENT=rca-worker
	@test -n "$(DEPLOYMENT)"
	bash scripts/kill-pod.sh "$(DEPLOYMENT)"

external-instances: ## 외부 콘솔 인스턴스별 Console/CD 상태 확인
	bash scripts/external-console-instances.sh

external-kubeconfig: ## 외부 콘솔 클러스터 kubeconfig 동기화/검증
	bash scripts/external-console-kubeconfig.sh

cluster-interactions: ## 두 클러스터 read-only 상태/서비스/Helm/event 확인
	bash scripts/cluster-interactions.sh

aws-up: ## AWS EKS management + target 2개 테스트 환경 생성
	bash scripts/aws-up.sh

aws-down: ## AWS EKS 테스트 환경 삭제
	bash scripts/aws-down.sh

clean: ## 재생성 가능한 캐시와 빌드 산출물 삭제
	# 안전 경계: .env*, outputs/, node_modules/, .venv/, tfstate, .git/은 절대 삭제하지 않는다.
	rm -rf -- .pytest_cache .ruff_cache .import_linter_cache .playwright-cli
	rm -rf -- frontend/.playwright-cli references/ui-layer-lab/.playwright-cli
	rm -rf -- frontend/dist references/ui-layer-lab/dist
	find alembic src tests scripts -type d -name __pycache__ -prune -exec rm -rf -- {} +
