# Database

개발 단계에서는 PostgreSQL을 Docker Compose와 Kubernetes 양쪽에서 띄웁니다. 운영/클라우드에서는 가능하면 관리형 DB를 씁니다.

## 로컬 개발

Docker Compose가 가장 편합니다.

```bash
make docker-up
```

API와 PostgreSQL이 함께 뜨고, API는 `DATABASE_URL`로 DB에 연결합니다.

## 로컬 Kubernetes

학습과 배포 구조 검증을 위해 kind 안에도 PostgreSQL Pod를 둡니다.

```bash
make k8s
```

로컬 kind의 DB는 학습용입니다. 데이터를 오래 보존해야 하는 운영 DB처럼 믿으면 안 됩니다.

## 운영/클라우드

보통은 Kubernetes 안에 직접 DB를 운영하기보다 관리형 DB를 씁니다.

- AWS RDS
- GCP Cloud SQL
- Azure Database for PostgreSQL

Kubernetes 안에 DB를 넣어야 한다면 StatefulSet과 PersistentVolume을 씁니다. StatefulSet은 Pod마다 안정적인 이름과 저장소를 유지하는 용도입니다.

## 마이그레이션

초기에는 앱 시작 시 더미 테이블을 자동 생성해 학습 흐름을 단순하게 둡니다. 테이블이 늘어나면 Alembic 마이그레이션으로 전환합니다.

권장 전환 시점:

- 테이블 3개 이상
- 팀원이 동시에 DB 스키마를 바꿈
- staging/prod 환경이 생김
