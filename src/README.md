# Python source layout

Python import root의 책임은 다음과 같다.

- `domains/`: 비즈니스 규칙과 port
- `packages/`: 공용 계약·런타임·저장소·보안 패키지
- `services/`: 독립 배포되는 API, worker, agent
- `entrypoints/`: OSS 조립과 bootstrap처럼 직접 실행하는 진입점
- `samples/`: smoke와 시나리오 테스트가 소비하는 입력 자료

실행 조립은 `entrypoints/`와 `services/`에만 둔다. 도메인 규칙은 `domains/`, 두 개
이상의 서비스가 공유하는 기술 구현은 `packages/`가 소유한다. 전체 루트 구조와
이동·삭제 기준은 [저장소 구조 원칙](../docs/architecture/repository-layout.md)을 따른다.
