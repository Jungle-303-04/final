"""Real backend browser E2E.

Required env:
- AUTH_EMAIL
- AUTH_PASSWORD

Optional env:
- BASE_URL or SMOKE_BASE, default http://127.0.0.1:4173
- PLAYWRIGHT_CHROMIUM_EXECUTABLE
- SMOKE_SHOTS_DIR, default /tmp/shots
- E2E_APP_BASE_PATH, default /console
- E2E_MUTATE=1 to run write flows against the real backend
"""

import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", os.environ.get("SMOKE_BASE", "http://127.0.0.1:4173")).rstrip("/")
APP_BASE_PATH = os.environ.get("E2E_APP_BASE_PATH", "/console").strip()
EMAIL = os.environ.get("AUTH_EMAIL", "").strip()
PASSWORD = os.environ.get("AUTH_PASSWORD", "")
EXPECTED_EMAIL = os.environ.get("E2E_EXPECTED_USER_EMAIL", EMAIL).strip()
CHROME = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE", "").strip()
SHOTS = os.environ.get("SMOKE_SHOTS_DIR", "/tmp/shots")
MUTATE = os.environ.get("E2E_MUTATE", "0") == "1"
ENTITY_PREFIX = os.environ.get("E2E_ENTITY_PREFIX", "e2e").strip() or "e2e"
RUN_ID = os.environ.get("E2E_RUN_ID", str(int(time.time())))


def app_url(path: str = "") -> str:
    base_path = "" if APP_BASE_PATH in ("", "/") else f"/{APP_BASE_PATH.strip('/')}"
    suffix = "" if not path else f"/{path.strip('/')}"
    return f"{BASE}{base_path}{suffix}"


def app_url_glob(path: str = "") -> str:
    base_path = "" if APP_BASE_PATH in ("", "/") else f"/{APP_BASE_PATH.strip('/')}"
    suffix = "" if not path else f"/{path.strip('/')}"
    return f"**{base_path}{suffix}"


def require_env(name: str, value: str) -> None:
    if value:
        return
    print(f"missing required environment variable: {name}", file=sys.stderr)
    raise SystemExit(2)


require_env("AUTH_EMAIL", EMAIL)
require_env("AUTH_PASSWORD", PASSWORD)
os.makedirs(SHOTS, exist_ok=True)

passed, failed = [], []


def ok(name: str) -> None:
    passed.append(name)
    print(f"  PASS {name}", flush=True)


def skip(name: str, reason: str) -> None:
    passed.append(name)
    print(f"  SKIP {name}: {reason}", flush=True)


def bad(name: str, error: Exception) -> None:
    failed.append((name, str(error)[:160]))
    print(f"  FAIL {name}: {str(error)[:160]}", flush=True)


with sync_playwright() as p:
    launch_kwargs = {
        "args": ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        "env": {
            **os.environ,
            "LD_LIBRARY_PATH": os.environ.get(
                "LD_LIBRARY_PATH",
                "/tmp/locallibs/usr/lib/aarch64-linux-gnu",
            ),
        },
    }
    if CHROME:
        launch_kwargs["executable_path"] = os.path.expanduser(CHROME)
    b = p.chromium.launch(**launch_kwargs)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.set_default_timeout(9000)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))

    def step(name, fn, *, mutates: bool = False):
        if mutates and not MUTATE:
            skip(name, "set E2E_MUTATE=1 to run real write flow")
            return
        try:
            fn()
            ok(name)
        except Exception as e:
            bad(name, e)
            pg.screenshot(path=f"{SHOTS}/real-fail-{len(failed)}.png")

    def s1():
        pg.goto(app_url())
        pg.wait_for_url("**/login**")

    step("미인증 -> 로그인 리다이렉트", s1)

    def s2():
        pg.fill("input[type=email]", EMAIL)
        pg.fill("input[type=password]", PASSWORD)
        pg.click("button[type=submit]")
        pg.wait_for_url(app_url_glob(), timeout=12000)
        pg.screenshot(path=f"{SHOTS}/real-01-overview.png")

    step("실백엔드 로그인 -> 세션 쿠키", s2)

    def s3():
        pg.reload()
        pg.wait_for_selector("text=플릿 현황")

    step("새로고침 세션 유지", s3)

    def s4():
        pg.goto(app_url("settings/members"))
        pg.wait_for_selector(f"text={EXPECTED_EMAIL}")
        pg.screenshot(path=f"{SHOTS}/real-02-members.png")

    step("실 사용자 목록", s4)

    def s5():
        org_name = f"{ENTITY_PREFIX}-org-{RUN_ID}"
        pg.goto(app_url("settings/orgs"))
        pg.click("[data-testid=new-org]")
        pg.fill("[data-testid=org-name]", org_name)
        pg.click("[data-testid=org-submit]")
        pg.wait_for_selector(f"td >> text={org_name}", timeout=9000)
        pg.screenshot(path=f"{SHOTS}/real-03-org-created.png")

    step("조직 생성 -> Postgres 저장 -> 목록 반영", s5, mutates=True)

    def s6():
        group_name = f"{ENTITY_PREFIX}-group-{RUN_ID}"
        pg.goto(app_url("settings/groups"))
        pg.click("text=+ 그룹 생성")
        pg.wait_for_selector(".modal")
        pg.locator(".modal input.input").last.fill(group_name)
        pg.locator(".modal button", has_text="생성").click()
        pg.wait_for_selector(f"td >> text={group_name}", timeout=9000)

    step("그룹 생성", s6, mutates=True)

    def s7():
        pg.goto(app_url("settings/access"))
        pg.click("text=+ 권한 부여")
        pg.wait_for_selector(".modal")
        pg.select_option(".modal select >> nth=0", "user")
        pg.select_option(".modal select >> nth=1", index=1)
        pg.select_option(".modal select >> nth=2", "cluster")

    step("권한 부여 폼 오픈", s7)

    def s8():
        pg.goto(app_url("ai"))
        pg.wait_for_selector("[data-testid=chat-input]", timeout=9000)
        pg.fill("[data-testid=chat-input]", f"real backend e2e {RUN_ID}")
        pg.click("[data-testid=chat-send]")
        pg.wait_for_url(app_url_glob("ai/**"), timeout=9000)
        pg.screenshot(path=f"{SHOTS}/real-04-ai.png")

    step("AI 대화 생성", s8, mutates=True)

    def s9():
        pg.locator("button", has_text="로그아웃").click()
        pg.wait_for_url("**/login**", timeout=9000)

    step("로그아웃 -> 세션 종료", s9)

    fatal = [e for e in errs if "Failed to fetch" not in e]
    if fatal:
        bad("콘솔 치명 에러 0건", RuntimeError("; ".join(fatal[:2])))
    else:
        ok("콘솔 치명 에러 0건")
    b.close()

print(f"\n결과: {len(passed)} passed/skipped, {len(failed)} failed", flush=True)
sys.exit(1 if failed else 0)
