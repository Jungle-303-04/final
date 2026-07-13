import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("SMOKE_BASE", "http://localhost:4173")
CHROME = os.path.expanduser("~/.cache/ms-playwright/chromium-1228/chrome-linux/chrome")
SHOTS = os.environ.get("SMOKE_SHOTS_DIR", "/tmp/shots")
os.makedirs(SHOTS, exist_ok=True)
passed, failed = [], []


def ok(name):
    passed.append(name)
    print(f"  ✓ {name}", flush=True)


def bad(name, e):
    failed.append((name, str(e)[:160]))
    print(f"  ✗ {name}: {str(e)[:160]}", flush=True)


with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path=CHROME,
        args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        env={**os.environ, "LD_LIBRARY_PATH": "/tmp/locallibs/usr/lib/aarch64-linux-gnu"},
    )
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.set_default_timeout(8000)
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))

    def step(name, fn):
        try:
            fn()
            ok(name)
        except Exception as e:
            bad(name, e)
            pg.screenshot(path=f"{SHOTS}/fail-{len(failed)}.png")

    def s1():
        pg.goto(f"{BASE}/overview")
        pg.wait_for_url("**/login**")

    step("미인증 → /login 리다이렉트", s1)

    def s2():
        pg.fill("input[type=password]", "local-test-password-1234")
        pg.click("button[type=submit]")
        pg.wait_for_url("**/clusters")
        pg.wait_for_selector("tbody tr")
        pg.screenshot(path=f"{SHOTS}/01-clusters.png")

    step("로그인 → 클러스터 목록", s2)

    def s4():
        pg.goto(f"{BASE}/clusters")
        pg.wait_for_selector("tbody tr")
        pg.locator("tbody tr", has_text="prod-seoul").click()
        pg.wait_for_url("**/clusters/cluster-1")
        for tab in ["팟", "노드", "서비스", "이벤트"]:
            pg.locator("div.tabs button", has_text=tab).first.click()
            pg.wait_for_timeout(350)
        pg.screenshot(path=f"{SHOTS}/02-cluster-detail.png")

    step("클러스터 상세 탭 순회", s4)

    def s5():
        pg.goto(f"{BASE}/repos")
        pg.wait_for_selector("tbody tr")
        pg.locator("tbody tr", has_text="checkout-api").first.click()
        pg.wait_for_selector("text=승인 대기")
        # plan 스타일 디프 — 승인 카드 아래 리소스별 +/~/- 미리보기
        pg.wait_for_selector("[data-testid=plan-diff]")
        pg.screenshot(path=f"{SHOTS}/03-repo-runs.png")
        pg.locator("button", has_text="승인").first.click()
        pg.wait_for_selector("text=승인 완료 — 배포가 진행됩니다")

    step("run 승인 → 전이 토스트", s5)

    def s7():
        pg.goto(f"{BASE}/ai")
        pg.wait_for_selector("text=sandbox CrashLoop 원인 분석")
        pg.click("text=sandbox CrashLoop 원인 분석")
        pg.wait_for_selector("[data-testid=action-card]")
        pg.locator("[data-testid=action-card] input[type=radio]").first.check()
        pg.locator("button", has_text="선택 실행").click()
        pg.wait_for_selector("text=실행됨")

    step("AI 액션 선택 실행 → 잠금", s7)

    def s8():
        pg.fill("[data-testid=chat-input]", "지금 상태 요약해줘")
        pg.click("[data-testid=chat-send]")
        pg.wait_for_selector("[data-testid=typing]")
        pg.wait_for_selector("text=확인했습니다", timeout=10000)
        pg.screenshot(path=f"{SHOTS}/05-ai-chat.png")

    step("채팅 왕복(waiting→응답)", s8)

    def s10():
        pg.goto(f"{BASE}/notifications")
        pg.wait_for_selector("text=인시던트")

    step("알림 합성 피드", s10)

    def s11():
        pg.goto(f"{BASE}/settings/members")
        pg.wait_for_selector("text=teammate@example.com")
        pg.click('[data-testid="approve-teammate@example.com"]')
        pg.wait_for_selector('[data-testid="approve-teammate@example.com"]', state="detached")

    step("멤버 승인 → 활성", s11)

    def s12():
        pg.goto(f"{BASE}/settings/orgs")
        pg.click("[data-testid=new-org]")
        pg.fill("[data-testid=org-name]", "QA조직")
        pg.click("[data-testid=org-submit]")
        pg.wait_for_selector("td >> text=QA조직")
        pg.screenshot(path=f"{SHOTS}/07-org-admin.png")

    step("조직 생성", s12)

    def s13():
        pg.goto(f"{BASE}/clusters")
        pg.locator("button", has_text="클러스터 등록").click()
        pg.click("[data-testid=wizard-next]")
        pg.click("[data-testid=wizard-next]")
        pg.fill("[data-testid=cluster-id]", "qa-cluster")
        pg.click("[data-testid=wizard-next]")
        pg.wait_for_selector("[data-testid=agent-token]")
        pg.screenshot(path=f"{SHOTS}/08-cluster-wizard.png")

    step("클러스터 등록 위저드 → 토큰 발급", s13)

    def s14():
        pg.locator("button", has_text="완료").click()
        pg.locator("button", has_text="로그아웃").click()
        pg.wait_for_url("**/login**")

    step("로그아웃 → /login", s14)

    if errors:
        bad("콘솔 pageerror 0건", "; ".join(errors[:2]))
    else:
        ok("콘솔 pageerror 0건")
    b.close()

print(f"\n결과: {len(passed)} passed, {len(failed)} failed", flush=True)
sys.exit(1 if failed else 0)
