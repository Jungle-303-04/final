# Frontend Tests

## Component smoke

Run focused Vite SSR tests for real-data UI behavior:

```bash
npm test
```

The current test covers the incident detail fallback route and verifies that a real recovery-plan payload still renders when the route id is a correlation id.

## Real backend smoke

Use the real backend browser smoke only with explicit credentials and keep write flows disabled unless a DB-mutating test is intentionally approved:

```bash
BASE_URL=https://k8s.woonyong.org \
AUTH_EMAIL=<redacted> \
AUTH_PASSWORD=<redacted> \
E2E_MUTATE=0 \
python frontend/tests/e2e_real_backend.py
```

Do not use mock mode, fixed production ids, or hardcoded credentials for production validation.
