# Entrypoints

사람이나 배포 도구가 직접 실행하는 Python 조립 지점이다.

- `app.py`: OSS 단일 프로세스 composition root
- `bootstrap.py`: OSS 데이터베이스·self agent 초기화
- `bootstrap_admin.py`: migration 이후 dev 관리자 초기화
- `demo_scm_fixture.py`: 로컬 demo 전용 SCM fixture
- `demo_workspace.py`: 명시적 demo workspace seed/reset 명령

이 폴더는 환경 로딩과 객체 조립만 담당한다. 재사용할 비즈니스 규칙은
`domains/`, 공용 기술 구현은 `packages/`, 독립 프로세스는 `services/`에 둔다.
