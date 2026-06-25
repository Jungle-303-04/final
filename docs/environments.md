# Environments

환경은 처음부터 이름만 나눠 둡니다.

## local

개인 PC 개발 환경입니다.

- Docker Compose
- kind Kubernetes
- `.env`

## dev

팀 통합 환경입니다.

- `dev` 브랜치 기준
- PR merge 후 자동 배포 후보
- GitHub Environment secret 사용 후보

## staging

운영 배포 전 검증 환경입니다.

- 운영과 최대한 같은 설정
- 테스트 데이터 또는 익명화 데이터

## prod

운영 환경입니다.

- `main` 브랜치 기준
- 직접 push 금지
- 배포 승인 필요

## kind 노드 수

kind는 1개 노드로 시작하는 것이 학습에 편합니다. 필요하면 `deploy/kind/kind-config.yaml`에서 worker node를 추가해 여러 노드 클러스터처럼 만들 수 있습니다.

처음에는 1개 노드로 충분합니다. 다음을 배우기 시작하면 2-3개 노드로 늘립니다.

- Pod 분산
- NodePort와 Service 흐름
- 스케줄링
- 장애 상황
