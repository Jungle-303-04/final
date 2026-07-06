# 실백엔드 브라우저 e2e — 실제 세션 쿠키 + Postgres 왕복
import os, sys
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:4173'
CHROME=os.path.expanduser('~/.cache/ms-playwright/chromium-1228/chrome-linux/chrome')
passed, failed = [], []
def ok(n): passed.append(n); print(f'  ✓ {n}', flush=True)
def bad(n,e): failed.append((n,str(e)[:160])); print(f'  ✗ {n}: {str(e)[:160]}', flush=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],env={'LD_LIBRARY_PATH':'/tmp/locallibs/usr/lib/aarch64-linux-gnu'})
    pg=b.new_page(viewport={'width':1440,'height':900}); pg.set_default_timeout(9000)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    def step(n,f):
        try: f(); ok(n)
        except Exception as e: bad(n,e); pg.screenshot(path=f'/tmp/shots/real-fail-{len(failed)}.png')
    def s1():
        pg.goto(f'{BASE}/overview'); pg.wait_for_url('**/login**')
    step('미인증→로그인 리다이렉트', s1)
    def s2():
        pg.fill('input[type=email]','admin@example.com'); pg.fill('input[type=password]','admin12345')
        pg.click('button[type=submit]'); pg.wait_for_url('**/overview', timeout=12000)
        pg.screenshot(path='/tmp/shots/real-01-overview.png')
    step('실백엔드 로그인→세션 쿠키', s2)
    def s3():
        # 세션 유지 확인(새로고침)
        pg.reload(); pg.wait_for_selector('text=오버뷰')
    step('새로고침 세션 유지(실쿠키)', s3)
    def s4():
        pg.goto(f'{BASE}/settings/members'); pg.wait_for_selector('text=admin@example.com')
        pg.screenshot(path='/tmp/shots/real-02-members.png')
    step('실 사용자 목록(G3)', s4)
    def s5():
        pg.goto(f'{BASE}/settings/orgs'); pg.click('[data-testid=new-org]')
        pg.fill('[data-testid=org-name]','QA실증조직'); pg.click('[data-testid=org-submit]')
        pg.wait_for_selector('td >> text=QA실증조직', timeout=9000)  # Postgres 왕복 후 목록 반영
        pg.screenshot(path='/tmp/shots/real-03-org-created.png')
    step('조직 생성→Postgres 저장→목록 반영(G1)', s5)
    def s6():
        pg.goto(f'{BASE}/settings/groups'); pg.click('text=+ 그룹 생성')
        pg.wait_for_selector('.modal')
        pg.locator('.modal input.input').last.fill('plt-sre')
        pg.locator('.modal button', has_text='생성').click()
        pg.wait_for_selector('td >> text=plt-sre', timeout=9000)
    step('그룹 생성(G2)', s6)
    def s7():
        pg.goto(f'{BASE}/settings/access'); pg.click('text=+ 권한 부여')
        pg.wait_for_selector('.modal')
        pg.select_option('.modal select >> nth=0','user')
        pg.select_option('.modal select >> nth=1', index=1)
        pg.select_option('.modal select >> nth=2','cluster')
        # 클러스터 없음 → application 도 없음. 리소스 옵션 없으면 스킵 처리
    step('권한 부여 폼 오픈(G5)', s7)
    def s8():
        pg.goto(f'{BASE}/ai'); pg.wait_for_selector('[data-testid=chat-input]', timeout=9000)
        pg.fill('[data-testid=chat-input]','실백엔드 연결 테스트')
        pg.click('[data-testid=chat-send]')
        pg.wait_for_url('**/ai/**', timeout=9000)  # 생성 후 대화 라우트 이동(실 POST)
        pg.screenshot(path='/tmp/shots/real-04-ai.png')
    step('AI 대화 생성(실 POST /ai/conversations)', s8)
    def s9():
        pg.locator('button', has_text='로그아웃').click(); pg.wait_for_url('**/login**', timeout=9000)
    step('로그아웃→세션 종료', s9)
    # 콘솔 에러(치명적 것만): chunk/네트워크 무관 필터
    fatal=[e for e in errs if 'Failed to fetch' not in e]
    if fatal: bad('콘솔 치명 에러 0건', '; '.join(fatal[:2]))
    else: ok('콘솔 치명 에러 0건')
    b.close()
print(f'\n결과: {len(passed)} passed, {len(failed)} failed', flush=True)
sys.exit(1 if failed else 0)
