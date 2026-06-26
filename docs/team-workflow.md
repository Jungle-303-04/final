# 팀 작업 흐름

상세한 팀 컨벤션과 5인 분배 기준은 아래 문서를 기준으로 한다.

- `docs/team/conventions.md`
- `docs/team/work-allocation.md`
- `docs/team/member-guides/*.md`

처음에는 `main`, `dev`, `user/<nickname>/<task>` 세 단계를 쓰면 가장 덜 헷갈린다.

현재 GitHub PR 규칙은 `main` 보호를 기본값으로 둔다. 팀이 `dev`를 실제 통합 브랜치로 만들면 아래 `dev` 흐름을 사용하고, 그렇지 않으면 기능 브랜치에서 `main`으로 PR을 보낸다.

## 브랜치

- `main`: 최종 안정 브랜치다. 직접 push하지 않는다.
- `dev`: 팀 통합 브랜치다. 기능 PR은 먼저 여기로 들어온다.
- `user/<nickname>/<task>`: 개인 작업 브랜치다. 예: `user/woonyong/rca-worker`.

새 작업에는 다음 형식을 더 권장한다.

```text
feat/<owner>/<topic>
fix/<owner>/<topic>
docs/<owner>/<topic>
ci/<owner>/<topic>
refactor/<owner>/<topic>
```

사용자별로 브랜치를 오래 고정하면 충돌과 stale 상태가 자주 생긴다. 대신 작업 단위로 짧게 브랜치를 만들고 PR로 빠르게 합친다.

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

GitHub에서 Pull Request를 만든다.

- 기능 브랜치 -> `dev`
- 릴리스 준비 -> `main`

## 커밋 메시지

커밋 제목은 한국어 요약을 포함한다.

```text
feat: worker 이벤트 처리 추가
docs: 팀 실행 문서와 브랜치 규칙 정리
ci: GitHub Actions Docker 검증 추가
```

## 보호 규칙

`main`과 `dev`는 보호 브랜치로 둔다.

- Pull Request 필수
- 리뷰 1명 이상
- CI 통과 필수
- 강제 push 금지
- 브랜치 삭제 금지

GitHub Actions `CI` workflow를 required status check로 설정한다. CI가 실패하면 PR은 merge하지 않는다.

## 초보자용 기준

개발자가 매번 외울 것은 세 개다.

```bash
git switch dev
git pull
git switch -c user/<nickname>/<task>
```

그리고 PR 대상은 대부분 `dev`다.
