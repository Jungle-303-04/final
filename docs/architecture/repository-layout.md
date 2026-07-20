# 저장소 구조 원칙

이 저장소는 Python, React, Tauri, Helm, Kubernetes, Terraform을 함께 관리하는
polyglot monorepo다. `src/`는 Python import root이며, 다른 런타임과 배포 정본을
모두 넣는 범용 폴더가 아니다.

## 루트 디렉터리

| 경로 | 책임 | 유지 이유 |
| --- | --- | --- |
| `.github/` | CI, 검증, 배포 workflow | GitHub Actions가 경로를 직접 참조한다. |
| `alembic/` | PostgreSQL schema migration | 애플리케이션 코드와 독립된 순차 migration 정본이다. |
| `benchmark/` | 성능·복구 시나리오 | 일반 단위 테스트와 실행 목적이 다르다. |
| `charts/` | Helm chart | Helm 표준 패키지 구조와 배포 경로를 유지한다. |
| `config/` | 로컬·운영 설정 템플릿 | 코드와 환경별 값의 경계를 유지한다. |
| `deploy/` | Kubernetes 실행 manifest | management, target, kind, OSS 배포 경계를 나타낸다. |
| `desktop/` | Tauri 네이티브 셸 | Rust/Cargo 빌드 루트이므로 Python `src/`와 분리한다. |
| `docs/` | 현재 아키텍처·운영 문서 | 코드 밖의 운영 근거와 결정을 보존한다. |
| `frontend/` | React/Vite 웹 애플리케이션 | 독립 Node 패키지와 빌드 산출물을 가진다. |
| `infra/` | Terraform 인프라 정본 | 클라우드 상태와 애플리케이션 배포를 분리한다. |
| `references/` | 격리된 원본 snapshot·provenance | 제품 빌드에서는 import하지 않는 비교 근거다. |
| `scripts/` | 저장소 단위 검증·배포 자동화 | 여러 런타임을 조율하는 진입점이다. |
| `secrets/` | SOPS/age 암호화 템플릿 | 평문 비밀값 없이 배포 입력 형식만 관리한다. |
| `src/` | Python 제품 코드 | 도메인, 공용 패키지, 서비스, 실행 진입점을 포함한다. |
| `tests/` | Python 계약·통합·회귀 테스트 | 제품 패키지와 테스트 코드를 분리한다. |

## Python 코드 경계

```text
src/
  domains/       비즈니스 규칙, 상태 모델, repository port
  packages/      여러 도메인과 서비스가 공유하는 기술 패키지
  services/      독립 배포되는 API, worker, agent process
  entrypoints/   OSS 조립과 bootstrap처럼 사람이 직접 실행하는 진입점
  samples/       smoke·시나리오 검증이 실제로 소비하는 입력 자료
```

의존 방향은 `entrypoints/services -> domains/packages`다. `domains`가 서비스
구현이나 UI에 의존하면 안 된다. `entrypoints`에는 도메인 규칙을 추가하지 않고
환경 로딩과 객체 조립만 둔다.

## 프런트엔드 코드 경계

```text
frontend/src/
  app/           셸, 라우팅, 전역 composition
  pages/         URL 단위 화면 조립
  features/      도메인 상호작용과 화면별 계약 소비
  shared/        공용 UI, i18n, 데이터·표현 도구
  api/           전송 계층 schema와 adapter
  desktop/       Tauri bridge port
  motion/        공용 motion token과 primitive
  styles/        제품 design token과 전역 스타일
  test/          공용 테스트 setup·fixture
```

페이지 사이의 코드를 직접 복사하지 않는다. 둘 이상의 화면에서 사용하는 동작은
`features/`, 순수 표현과 도구는 `shared/`로 올린다. API 응답은 화면에서 직접
해석하지 않고 `api/` 또는 해당 feature 계약에서 검증한다.

## 생성 파일과 캐시

다음 경로는 Git에 포함하지 않지만 로컬 증분 실행 속도를 높이므로 평상시 유지한다.

- `.venv/`, `frontend/node_modules/`: 설치된 의존성
- `.import_linter_cache/`, `.pytest_cache/`, `.ruff_cache/`: Python 검사 캐시
- `frontend/tsconfig.tsbuildinfo`: TypeScript 증분 검사 캐시
- `frontend/dist/`: 최근 로컬 빌드 결과

디스크 확보나 완전 재현 검증이 필요할 때만 `make clean`을 실행한다. IDE 전용
`.idea/`, 운영체제 메타데이터, Python `__pycache__/`는 제품 정본이 아니며 Git에
추가하지 않는다.

## 이동·삭제 기준

폴더 이동이나 문서 삭제 전에는 반드시 import, CI, manifest, script, 문서의 inbound
reference를 검색한다. 참조가 없고 정본으로 대체되었으며 관련 테스트가 통과할 때만
삭제한다. 이름만 단순화하려고 서로 다른 빌드 루트를 합치지 않는다.
