# 저장소 정리 보고서

- 조사: `git status --porcelain -uall --ignored=matching` (134개 항목)
- 범위: untracked / gitignored 파일만
- 저장소 용량: `1.7G` → `1.6G`
- tracked 삭제: 전 0개 / 후 0개

## 명시 대상

| 경로 | 정리 전 크기 | 분류 | 판정 | 이유 |
|---|---:|---|---|---|
| `bugreport-sdk_gphone64_arm64-BE4B.251210.005-2026-07-10-01-42-31.zip` | 없음 | 잡파일 | 보존 | 작업 전부터 없음 |
| `.e2e-tmp-sweep.py` | 없음 | 잡파일 | 보존 | 작업 전부터 없음 |
| `outputs/week3-project-progress-7slides-text-layout.pptx` | 없음 | 잡파일 | 보존 | 작업 전부터 없음 |
| `outputs/week3-project-progress-7slides-text-layout.pptx.inspect.ndjson` | 없음 | 잡파일 | 보존 | 작업 전부터 없음 |
| `outputs/week3-slide01-event-platform-text-layout.pptx` | 없음 | 잡파일 | 보존 | 작업 전부터 없음 |
| `outputs/week3-slide01-event-platform-text-layout.pptx.inspect.ndjson` | 없음 | 잡파일 | 보존 | 작업 전부터 없음 |
| `output/` | 없음 | 잡파일 | 보존 | 루트 경로는 없음. 별개인 `frontend/output/`은 범위 밖 |
| `.pytest_cache/` | 340K | 캐시 | 삭제 | 재생성 가능 |
| `.ruff_cache/` | 396K | 캐시 | 삭제 | 재생성 가능 |
| `.import_linter_cache/` | 156K | 캐시 | 삭제 | 재생성 가능 |
| `.playwright-cli/` | 없음 | 캐시 | 보존 | 작업 전부터 없음 |
| `frontend/.playwright-cli/` | 72K | 캐시 | 삭제 | 재생성 가능 |
| `references/ui-layer-lab/.playwright-cli/` | 없음 | 캐시 | 보존 | 작업 전부터 없음 |
| 프로젝트 소스 `**/__pycache__/` 102개 | 약 17M | 캐시 | 삭제 | 재생성 가능 |
| `.venv/` 내부 `**/__pycache__/` 178개 | 25M | 환경 | 보존 | `.venv/` 보존 원칙 우선 |
| `frontend/dist/` | 3.3M | 빌드 산출물 | 삭제 | 재생성 가능 |
| `references/ui-layer-lab/dist/` | 없음 | 빌드 산출물 | 보존 | 작업 전부터 없음 |
| `.idea/` | 36K | 에디터 설정 | 삭제 | 추천 확장·공유 디버그 구성 없음. 개인 SDK·경로·계정·workspace 상태 중심 |
| `.vscode/` | 없음 | 에디터 설정 | 보존 | 작업 전부터 없음 |

## 절대 삭제 금지와 승인 필요

| 경로 | 크기 | 분류 | 판정 | 이유 |
|---|---:|---|---|---|
| `.env` | 없음 | 비밀 값 | 보존 | 작업 전부터 없음. 내용을 열지 않음 |
| `.env.local-test` | 없음 | 비밀 값 | 보존 | 작업 전부터 없음. 내용을 열지 않음 |
| 클라우드 로컬 환경 파일 | 없음 | 비밀 값 | 보존 | 작업 전부터 없음. 내용을 열지 않음 |
| 클라우드 인스턴스 환경 파일 | 없음 | 비밀 값 | 보존 | 작업 전부터 없음. 내용을 열지 않음 |
| `outputs/local-bruno/environments/aws-live.local.bru` | 없음 | AWS 자격 정보 | 보존 | 작업 전부터 없음. `outputs/`는 폴더째 삭제하지 않음 |
| `.git/` | 측정 안 함 | Git 데이터 | 보존 | 절대 삭제 금지 |
| `infra/**/*.tfstate`, `*.tfstate.backup` | 없음 | Terraform 상태 | 보존 | `.terraform/` 밖에서 0개 확인 |
| tracked 파일 전체 | 해당 없음 | 소스/문서 | 보존 | 삭제 전후 손실 0개 |
| `references/ui-layer-lab/node_modules/` | 724M | 의존성 | 승인 필요 | 삭제 시 재설치 필요, 724M 확보 가능 |
| `node_modules/` | 없음 | 의존성 | 보존 | 작업 전부터 없음 |
| `frontend/node_modules/` | 741M | 의존성 | 승인 필요 | 다른 세션 사용 가능성. 삭제 시 재설치 필요, 741M 확보 가능 |
| `.venv/` | 143M | Python 환경 | 승인 필요 | 다른 세션 사용 가능성. 삭제 시 `uv sync` 필요, 143M 확보 가능 |
| `infra/.terraform/` | 없음 | provider 캐시 | 보존 | 작업 전부터 없음 |

## 추가 발견 항목

| 경로 | 크기 | 분류 | 판정 | 이유 |
|---|---:|---|---|---|
| `docs/demo-scenario-20260714.md` | 9.0K | untracked 문서 | 보존 | 사람이 만든 작업물 |
| `docs/poster-assets/feature1-connection.{png,svg}` | 측정 안 함 | untracked 자산 | 보존 | 사람이 만든 작업물 |
| `docs/poster-plan.md` | 22K | untracked 문서 | 보존 | 사람이 만든 작업물 |
| `docs/presentation-script-v2.md` | 8.4K | untracked 문서 | 보존 | 사람이 만든 작업물 |
| `outputs/Opsia_Poster_8_Slides*` | 약 112K + PNG 8개 | untracked 산출물 | 보존 | 명시된 4개 파일이 아님 |
| `.DS_Store`, `docs/.DS_Store` | 20K | OS 잡파일 | 보존 | 명시 삭제 목록 밖 |
| `docs/api/.certs/` | 8.0K | 로컬 인증서 | 보존 | 민감할 수 있어 범위 밖 |
| `frontend/output/` | 220K | 프론트 출력 | 보존 | 루트 `output/`과 다른 경로 |
| `frontend/tsconfig.tsbuildinfo` | 336K | 빌드 캐시 | 보존 | 명시 삭제 목록 밖 |
| `references/upstream/.claude/` | 24K | 도구 설정 | 보존 | immutable source snapshot 하위 |
| `references/upstream/build/` | 452K | upstream 산출물 | 보존 | immutable source snapshot 하위 |
| `references/upstream/internal/static/dist/` | 16K | upstream 산출물 | 보존 | immutable source snapshot 하위 |

## 안전 확인

- 삭제는 표의 `삭제` 경로로만 제한했다.
- `outputs/`, `node_modules/`, `.venv/`, `.git/`, Terraform 상태는 삭제하지 않았다.
- `.env` 4개와 local-bruno 자격 파일은 작업 전부터 없었으며 작업 후에도 없다.
- `git ls-files --deleted` 결과는 0개다.
