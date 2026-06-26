# Team Workflow

상세한 팀 컨벤션과 5인 분배 기준은 다음 문서를 기준으로 한다.

- `docs/team/conventions.md`
- `docs/team/work-allocation.md`
- `docs/team/member-guides/*.md`

초보자에게 가장 덜 헷갈리는 흐름은 `main`, `dev`, `user/<nickname>/<task>` 세 단계입니다.

현재 GitHub PR 규칙은 `main` 보호를 기본값으로 둔다. 팀이 `dev`를 실제 통합 브랜치로 만들면 아래 `dev` 흐름을 사용하고, 그렇지 않으면 기능 브랜치에서 `main`으로 PR을 보낸다.

## 브랜치

- `main`: 최종 안정 브랜치입니다. 직접 push하지 않습니다.
- `dev`: 팀 통합 브랜치입니다. 기능 PR은 먼저 여기로 들어옵니다.
- `user/<nickname>/<task>`: 개인 작업 브랜치입니다. 예: `user/woonyong/rca-worker`.

새 작업에는 다음 형식을 더 권장한다.

```text
feat/<owner>/<topic>
fix/<owner>/<topic>
docs/<owner>/<topic>
ci/<owner>/<topic>
refactor/<owner>/<topic>
```

사용자별로 브랜치를 완전히 고정해서 오래 쓰면 충돌과 stale 상태가 자주 생깁니다. 대신 닉네임을 prefix로 쓰고, 작업 단위는 짧게 끊습니다.

## 작업 순서

```bash
git switch dev
git pull origin dev
git switch -c user/<nickname>/<task>
```

작업 후:

```bash
make check
git push origin user/<nickname>/<task>
```

GitHub에서 Pull Request를 만듭니다.

- 기능 브랜치 -> `dev`
- 릴리스 준비 -> `main`

## 커밋 메시지

커밋 제목은 한국어 키워드를 포함합니다.

```text
feat: worker / 이벤트 처리 / 대시보드 반영
docs: 팀 실행 문서 / 브랜치 규칙 / 시크릿 정책
ci: GitHub Actions / 테스트 / Docker 검증
```

## 보호 규칙

`main`과 `dev`는 보호 브랜치로 둡니다.

- Pull Request 필수
- 리뷰 1명 이상
- CI 통과 필수
- 강제 push 금지
- 브랜치 삭제 금지

GitHub Actions `CI` workflow를 required status check로 설정한다. CI가 실패하면 PR은 merge하지 않는다.

## 초보자용 기준

개발자가 매번 외울 것은 세 개입니다.

```bash
git switch dev
git pull
git switch -c user/<nickname>/<task>
```

그리고 PR 대상은 대부분 `dev`입니다.
