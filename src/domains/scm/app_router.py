"""GitHub App 연동 엔드포인트.

- config       : App 구성 여부(프론트가 PAT/App 분기 판단)
- install-url  : 설치 리다이렉트 URL(state 로 진행 중 연결과 연동)
- verify       : installation_id 가 실제로 그 레포에 설치됐는지 + 권한 확인
                 (주소 불일치·권한 부족을 등록 시점에 걸러낸다)

App 미구성 시 config 는 configured=False, 그 외는 409 로 degrade 하여
기존 PAT 흐름을 깨지 않는다.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from domains.identity.dependencies import require_session
from domains.scm.github_app import (
    GithubAppClient,
    GithubAppNotConfigured,
    is_configured,
    load_github_app_config,
)
from packages.config.settings import env

router = APIRouter()

GITHUB_APP_CONFIG_PATH = "/api/integrations/github/app/config"
GITHUB_APP_INSTALL_URL_PATH = "/api/integrations/github/app/install-url"
GITHUB_APP_CALLBACK_PATH = "/api/integrations/github/app/callback"
GITHUB_APP_VERIFY_PATH = "/api/integrations/github/app/installations/{installation_id}/verify"

# 설치 완료 후 GitHub 이 브라우저를 되돌려보낼 프론트 위저드 URL.
# 프로덕션은 동일 오리진("/"), 로컬 dev 는 http://localhost:5173/ 등으로 지정.
GITHUB_APP_WEB_RETURN_URL_ENV = "GITHUB_APP_WEB_RETURN_URL"


class GithubAppConfigResponse(BaseModel):
    configured: bool
    slug: str | None
    install_available: bool


class InstallUrlResponse(BaseModel):
    url: str


class VerifyRequest(BaseModel):
    repo_ref: str


class VerifyResponse(BaseModel):
    installation_id: str
    matches: bool
    write_capable: bool
    repositories: list[str]
    permissions: dict[str, str]
    repository_selection: str | None


def _normalize(repo_ref: str) -> str:
    text = repo_ref.strip().lower()
    for prefix in ("https://github.com/", "http://github.com/", "git@github.com:"):
        if text.startswith(prefix):
            text = text[len(prefix) :]
            break
    if text.endswith(".git"):
        text = text[: -len(".git")]
    return text.strip("/")


@router.get(GITHUB_APP_CONFIG_PATH, response_model=GithubAppConfigResponse)
async def github_app_config(
    current: Any = Depends(require_session),
) -> GithubAppConfigResponse:
    cfg = load_github_app_config()
    return GithubAppConfigResponse(
        configured=cfg.configured,
        slug=cfg.slug or None,
        install_available=bool(cfg.configured and cfg.slug),
    )


@router.get(GITHUB_APP_INSTALL_URL_PATH, response_model=InstallUrlResponse)
async def github_app_install_url(
    state: str | None = None,
    current: Any = Depends(require_session),
) -> InstallUrlResponse:
    try:
        return InstallUrlResponse(url=GithubAppClient().install_url(state=state))
    except GithubAppNotConfigured as exc:
        raise HTTPException(status_code=409, detail="github_app_not_configured") from exc


@router.get(GITHUB_APP_CALLBACK_PATH)
async def github_app_callback(
    installation_id: str | None = None,
    setup_action: str | None = None,
    state: str | None = None,
) -> RedirectResponse:
    """GitHub 설치/승인 후 브라우저 복귀 지점.

    installation_id·state 를 프론트 위저드로 그대로 넘긴다(state 는 프론트가
    자신이 발급·저장한 값과 대조해 CSRF 를 막는다). 위저드가 이어서 verify 를
    호출한다. 자격증명 결속은 verify 통과 후 연결 확정 시점에 이뤄지므로
    콜백에서는 DB 를 건드리지 않는다(부작용 없음).
    """
    return_base = env(GITHUB_APP_WEB_RETURN_URL_ENV, "/").strip() or "/"
    params: dict[str, str] = {}
    if installation_id:
        params["github_app_installation_id"] = installation_id
    if setup_action:
        params["github_app_setup_action"] = setup_action
    if state:
        params["github_app_state"] = state
    if params:
        sep = "&" if "?" in return_base else "?"
        target = f"{return_base}{sep}{urlencode(params)}"
    else:
        target = return_base
    return RedirectResponse(url=target, status_code=302)


@router.post(GITHUB_APP_VERIFY_PATH, response_model=VerifyResponse)
async def github_app_verify_installation(
    installation_id: str,
    payload: VerifyRequest,
    current: Any = Depends(require_session),
) -> VerifyResponse:
    """설치가 그 레포에 실제로 걸려 있고 PR 쓰기 권한이 있는지 등록 시점에 검증한다."""
    if not is_configured():
        raise HTTPException(status_code=409, detail="github_app_not_configured")
    client = GithubAppClient()
    try:
        async with httpx.AsyncClient(timeout=20.0) as http:
            minted = await client.mint_installation_token(installation_id, client=http)
            repos = await client.list_installation_repositories(
                installation_id, client=http, token=minted["token"]
            )
    except GithubAppNotConfigured as exc:
        raise HTTPException(status_code=409, detail="github_app_not_configured") from exc
    except httpx.HTTPStatusError as exc:
        code = exc.response.status_code
        if code in (401, 403):
            raise HTTPException(status_code=409, detail="github_app_installation_invalid") from exc
        if code == 404:
            raise HTTPException(status_code=404, detail="github_app_installation_not_found") from exc
        raise HTTPException(status_code=502, detail="github_app_upstream_error") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="github_app_upstream_error") from exc

    full_names = [str(r.get("full_name", "")) for r in repos if r.get("full_name")]
    target = _normalize(payload.repo_ref)
    matches = any(_normalize(name) == target for name in full_names)
    permissions = {str(k): str(v) for k, v in (minted.get("permissions") or {}).items()}
    # PR 쓰기 = contents:write + pull_requests:write
    write_capable = (
        permissions.get("contents") == "write" and permissions.get("pull_requests") == "write"
    )
    return VerifyResponse(
        installation_id=installation_id,
        matches=matches,
        write_capable=write_capable,
        repositories=full_names,
        permissions=permissions,
        repository_selection=minted.get("repository_selection"),
    )
