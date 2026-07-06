#!/usr/bin/env python3
"""KubeHeal 전체 API 통합 테스트 — 실제 HTTP 요청으로 엔드포인트별 검증."""

from __future__ import annotations

import sys
import uuid
from dataclasses import dataclass

import httpx

BASE = "http://localhost:18080"
EMAIL = "admin.local@example.com"
PASSWORD = "local-test-password-1234"


# ── result tracking ──────────────────────────────────────────────
@dataclass
class Result:
    method: str
    path: str
    status: int
    ok: bool
    note: str = ""
    body_snippet: str = ""


results: list[Result] = []


def record(
    method: str, path: str, resp: httpx.Response, *, expect: int | set[int] = 200, note: str = ""
):
    if isinstance(expect, int):
        expect = {expect}
    ok = resp.status_code in expect
    snippet = resp.text[:200] if resp.text else ""
    r = Result(method, path, resp.status_code, ok, note, snippet)
    results.append(r)
    symbol = "✅" if ok else "❌"
    print(
        f"  {symbol} {method:7s} {path:60s} → {resp.status_code} {'OK' if ok else 'FAIL'}  {note}"
    )
    return r


# ── helpers ──────────────────────────────────────────────────────
def login(client: httpx.Client):
    resp = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    record("POST", "/auth/login", resp, note="admin login")
    return resp


# ╔══════════════════════════════════════════════════════════════╗
# ║ 1. HEALTH / INFRA                                          ║
# ╚══════════════════════════════════════════════════════════════╝
def test_health(c: httpx.Client):
    print("\n── 1. Health & Infra ──")
    record("GET", "/healthz", c.get("/healthz"))
    record("GET", "/readyz", c.get("/readyz"))
    record("GET", "/metrics", c.get("/metrics"))


# ╔══════════════════════════════════════════════════════════════╗
# ║ 2. AUTH FLOW                                                ║
# ╚══════════════════════════════════════════════════════════════╝
def test_auth(c: httpx.Client):
    print("\n── 2. Auth Flow ──")
    # 2-1. signup (new user)
    test_email = f"test-{uuid.uuid4().hex[:8]}@example.com"
    resp = c.post(
        "/auth/signup",
        json={"email": test_email, "password": "Test1234!!", "password_confirm": "Test1234!!"},
    )
    record("POST", "/auth/signup", resp, expect={200, 201}, note=f"signup {test_email}")

    # 2-2. resend-verification (requires email + password)
    resp = c.post("/auth/resend-verification", json={"email": test_email, "password": "Test1234!!"})
    record("POST", "/auth/resend-verification", resp, expect={200, 202}, note="resend verification")

    # 2-3. login with bad creds → expect 401 (password ≥8 chars to pass validation)
    resp = c.post(
        "/auth/login", json={"email": "wrong@example.com", "password": "wrongpassword123"}
    )
    record("POST", "/auth/login (bad)", resp, expect=401, note="wrong creds → 401")

    # 2-4. login as admin
    login(c)

    # 2-5. session
    resp = c.get("/auth/session")
    record("GET", "/auth/session", resp, note="session check")

    # 2-6. unauthenticated session → 401
    anon = httpx.Client(base_url=BASE, timeout=10)
    resp = anon.get("/auth/session")
    record("GET", "/auth/session (anon)", resp, expect=401, note="no cookie → 401")
    anon.close()

    # 2-7. approve user (the test user we just created)
    # First we need the user id — list users
    resp = c.get("/users")
    record("GET", "/users", resp, note="list users")
    body = resp.json() if resp.status_code == 200 else {}
    users = body.get("users", []) if isinstance(body, dict) else body
    test_user_id = None
    for u in users:
        if isinstance(u, dict) and u.get("email") == test_email:
            test_user_id = u["user_id"]
            break

    if test_user_id:
        # User is in pending_email_verification state; approve may 404 if email not verified.
        resp = c.post(f"/auth/users/{test_user_id}/approve")
        record(
            "POST",
            "/auth/users/{id}/approve",
            resp,
            expect={200, 204, 404, 409},
            note="approve user (may 404 if unverified)",
        )

    # 2-8. logout
    resp = c.post("/auth/logout")
    record("POST", "/auth/logout", resp, note="logout")

    # 2-9. re-login for subsequent tests
    login(c)


# ╔══════════════════════════════════════════════════════════════╗
# ║ 3. IDENTITY ADMIN — Orgs / Groups / Access                 ║
# ╚══════════════════════════════════════════════════════════════╝
def test_identity_admin(c: httpx.Client) -> dict:
    print("\n── 3. Identity Admin (Orgs/Groups/Access) ──")
    ids: dict = {}

    # orgs
    resp = c.get("/orgs")
    record("GET", "/orgs", resp, note="list orgs")

    org_name = f"test-org-{uuid.uuid4().hex[:6]}"
    resp = c.post("/orgs", json={"name": org_name})
    record("POST", "/orgs", resp, expect={200, 201}, note="create org")
    if resp.status_code in (200, 201):
        ids["org_id"] = resp.json().get("org_id") or resp.json().get("id")

    # groups (requires org_id)
    resp = c.get("/groups")
    record("GET", "/groups", resp, note="list groups")

    if ids.get("org_id"):
        resp = c.post(
            "/groups", json={"name": f"test-group-{uuid.uuid4().hex[:6]}", "org_id": ids["org_id"]}
        )
    else:
        # fallback: try with existing org from list
        orgs_body = c.get("/orgs").json()
        org_list = orgs_body.get("orgs", []) if isinstance(orgs_body, dict) else orgs_body
        fallback_org_id = org_list[0].get("org_id", "") if org_list else ""
        resp = c.post(
            "/groups",
            json={"name": f"test-group-{uuid.uuid4().hex[:6]}", "org_id": fallback_org_id},
        )
    record("POST", "/groups", resp, expect={200, 201}, note="create group")
    if resp.status_code in (200, 201):
        ids["group_id"] = resp.json().get("group_id") or resp.json().get("id")

    if ids.get("group_id"):
        resp = c.get(f"/groups/{ids['group_id']}/members")
        record("GET", "/groups/{id}/members", resp, note="list group members")

        # add member (self)
        session = c.get("/auth/session").json()
        user_id = session.get("user_id", "")
        resp = c.put(f"/groups/{ids['group_id']}/members/{user_id}")
        record("PUT", "/groups/{id}/members/{uid}", resp, expect={200, 204}, note="add member")

        resp = c.delete(f"/groups/{ids['group_id']}/members/{user_id}")
        record(
            "DELETE", "/groups/{id}/members/{uid}", resp, expect={200, 204}, note="remove member"
        )

    # access
    resp = c.get("/access")
    record("GET", "/access", resp, note="list access")

    # cleanup: no group DELETE endpoint exists (only member removal).
    # Org delete with existing groups → 409 (correct referential integrity).
    if ids.get("org_id"):
        resp = c.delete(f"/orgs/{ids['org_id']}")
        record(
            "DELETE",
            "/orgs/{id}",
            resp,
            expect={200, 204, 409},
            note="delete org (409 if groups exist)",
        )

    return ids


# ╔══════════════════════════════════════════════════════════════╗
# ║ 4. PROVIDERS / CATALOG                                     ║
# ╚══════════════════════════════════════════════════════════════╝
def test_providers_catalog(c: httpx.Client):
    print("\n── 4. Providers & Catalog ──")
    resp = c.get("/providers/catalog")
    record("GET", "/providers/catalog", resp)

    resp = c.post("/providers/validate", json={"providers": []})
    record("POST", "/providers/validate", resp, expect={200, 422})

    resp = c.get("/catalog/items")
    record("GET", "/catalog/items", resp)


# ╔══════════════════════════════════════════════════════════════╗
# ║ 5. TARGETS / CLUSTERS                                      ║
# ╚══════════════════════════════════════════════════════════════╝
def test_targets(c: httpx.Client) -> str | None:
    print("\n── 5. Targets & Clusters ──")
    resp = c.get("/clusters")
    record("GET", "/clusters", resp, note="list clusters")
    body = resp.json() if resp.status_code == 200 else {}
    clusters = body.get("clusters", []) if isinstance(body, dict) else body
    cluster_id = clusters[0]["cluster_id"] if clusters else None

    if cluster_id:
        resp = c.get(f"/clusters/{cluster_id}")
        record("GET", "/clusters/{id}", resp, note=f"get cluster {cluster_id}")

        resp = c.get(f"/clusters/{cluster_id}/connection-status")
        record("GET", "/clusters/{id}/connection-status", resp)

        resp = c.put(f"/clusters/{cluster_id}/policy", json={"auto_heal": False})
        record("PUT", "/clusters/{id}/policy", resp, expect={200, 204, 422})

    # non-existent cluster → 404
    resp = c.get("/clusters/nonexistent-cluster-id")
    record(
        "GET", "/clusters/nonexistent-cluster-id", resp, expect={403, 404}, note="bad cluster → 4xx"
    )

    return cluster_id


# ╔══════════════════════════════════════════════════════════════╗
# ║ 6. INVENTORY                                               ║
# ╚══════════════════════════════════════════════════════════════╝
def test_inventory(c: httpx.Client, cluster_id: str | None):
    print("\n── 6. Inventory ──")
    if not cluster_id:
        print("  ⚠️  No cluster — skipping inventory")
        return
    for sub in ("resources", "workloads", "services", "events", "summary"):
        resp = c.get(f"/clusters/{cluster_id}/inventory/{sub}")
        record("GET", f"/clusters/{{id}}/inventory/{sub}", resp, expect={200, 404})


# ╔══════════════════════════════════════════════════════════════╗
# ║ 7. AI CONVERSATIONS                                        ║
# ╚══════════════════════════════════════════════════════════════╝
def test_ai(c: httpx.Client):
    print("\n── 7. AI Conversations ──")
    # Create conversation requires 'message' field (the first message)
    resp = c.post(
        "/ai/conversations",
        json={"message": "hello, this is an integration test", "title": "integration test"},
    )
    record("POST", "/ai/conversations", resp, expect={200, 201}, note="create conversation")
    conv_id = None
    if resp.status_code in (200, 201):
        body = resp.json()
        conv_id = body.get("conversation_id") or body.get("id")

    resp = c.get("/ai/conversations")
    record("GET", "/ai/conversations", resp, note="list conversations")

    if conv_id:
        resp = c.get(f"/ai/conversations/{conv_id}")
        record("GET", "/ai/conversations/{id}", resp)

        # Send additional message (requires 'message' field)
        resp = c.post(
            f"/ai/conversations/{conv_id}/messages", json={"message": "follow-up question"}
        )
        record(
            "POST",
            "/ai/conversations/{id}/messages",
            resp,
            expect={200, 201, 202},
            note="send message",
        )

    # non-existent
    resp = c.get(f"/ai/conversations/{uuid.uuid4()}")
    record("GET", "/ai/conversations/{bad_id}", resp, expect={404}, note="non-existent → 404")


# ╔══════════════════════════════════════════════════════════════╗
# ║ 8. APPLICATIONS                                            ║
# ╚══════════════════════════════════════════════════════════════╝
def test_applications(c: httpx.Client):
    print("\n── 8. Applications ──")
    resp = c.get("/applications")
    record("GET", "/applications", resp, note="list apps")

    resp = c.post(
        "/applications",
        json={
            "name": f"test-app-{uuid.uuid4().hex[:6]}",
            "repo_url": "https://github.com/test/repo",
        },
    )
    record("POST", "/applications", resp, expect={200, 201, 422})

    if resp.status_code in (200, 201):
        body = resp.json()
        app_id = body.get("application_id") or body.get("id")
        if app_id:
            resp = c.get(f"/applications/{app_id}")
            record("GET", "/applications/{id}", resp)

            resp = c.get(f"/applications/{app_id}/deployments")
            record("GET", "/applications/{id}/deployments", resp)

            resp = c.get(f"/applications/{app_id}/runs")
            record("GET", "/applications/{id}/runs", resp)


# ╔══════════════════════════════════════════════════════════════╗
# ║ 9. DASHBOARD                                               ║
# ╚══════════════════════════════════════════════════════════════╝
def test_dashboard(c: httpx.Client):
    print("\n── 9. Dashboard ──")
    resp = c.get("/dashboard/rca/timeline")
    record("GET", "/dashboard/rca/timeline", resp)

    resp = c.get(f"/dashboard/rca/incidents/{uuid.uuid4()}")
    record("GET", "/dashboard/rca/incidents/{id}", resp, expect={404}, note="non-existent incident")


# ╔══════════════════════════════════════════════════════════════╗
# ║ 10. DEAD LETTERS                                           ║
# ╚══════════════════════════════════════════════════════════════╝
def test_dead_letters(c: httpx.Client):
    print("\n── 10. Dead Letters ──")
    resp = c.get("/dead-letters")
    record("GET", "/dead-letters", resp)

    resp = c.post(f"/dead-letters/{uuid.uuid4()}/replay")
    record("POST", "/dead-letters/{id}/replay", resp, expect={404, 422}, note="replay non-existent")


# ╔══════════════════════════════════════════════════════════════╗
# ║ 11. COMMANDS                                               ║
# ╚══════════════════════════════════════════════════════════════╝
def test_commands(c: httpx.Client, cluster_id: str | None):
    print("\n── 11. Commands ──")
    if not cluster_id:
        print("  ⚠️  No cluster — skipping commands")
        return

    # debug query
    resp = c.post(
        "/agent/debug/query", json={"cluster_id": cluster_id, "query": "get pods -n default"}
    )
    record("POST", "/agent/debug/query", resp, expect={200, 201, 202, 422})

    # scale (non-existent deployment → 404/422)
    resp = c.post(
        f"/clusters/{cluster_id}/namespaces/default/deployments/fake-deploy/scale",
        json={"replicas": 1},
    )
    record("POST", "/clusters/{id}/.../scale", resp, expect={200, 201, 202, 404, 422})

    resp = c.post(f"/clusters/{cluster_id}/namespaces/default/deployments/fake-deploy/restart")
    record("POST", "/clusters/{id}/.../restart", resp, expect={200, 201, 202, 404, 422})


# ╔══════════════════════════════════════════════════════════════╗
# ║ 12. GITOPS                                                 ║
# ╚══════════════════════════════════════════════════════════════╝
def test_gitops(c: httpx.Client):
    print("\n── 12. GitOps ──")
    # Approval endpoints with non-existent id
    resp = c.post(f"/approvals/{uuid.uuid4()}/grant")
    record("POST", "/approvals/{id}/grant", resp, expect={404, 422}, note="non-existent approval")

    resp = c.post(f"/approvals/{uuid.uuid4()}/reject")
    record("POST", "/approvals/{id}/reject", resp, expect={404, 422}, note="non-existent approval")


# ╔══════════════════════════════════════════════════════════════╗
# ║ 13. ERROR CASES                                            ║
# ╚══════════════════════════════════════════════════════════════╝
def test_errors(c: httpx.Client):
    print("\n── 13. Error Cases ──")
    # wrong content type
    resp = c.post("/auth/login", content="not json", headers={"Content-Type": "text/plain"})
    record(
        "POST",
        "/auth/login (bad content-type)",
        resp,
        expect={400, 415, 422},
        note="bad content-type",
    )

    # malformed json
    resp = c.post("/auth/login", content="{bad json", headers={"Content-Type": "application/json"})
    record("POST", "/auth/login (malformed json)", resp, expect={400, 422}, note="malformed json")

    # 404 route
    resp = c.get("/nonexistent-route")
    record("GET", "/nonexistent-route", resp, expect=404, note="unknown route → 404")

    # signup validation errors
    resp = c.post(
        "/auth/signup", json={"email": "not-an-email", "password": "x", "password_confirm": "y"}
    )
    record("POST", "/auth/signup (bad input)", resp, expect={400, 422}, note="validation error")

    # unauthenticated CRUD
    anon = httpx.Client(base_url=BASE, timeout=10)
    resp = anon.get("/clusters")
    record("GET", "/clusters (anon)", resp, expect=401, note="no auth → 401")
    resp = anon.post("/ai/conversations", json={"title": "test"})
    record("POST", "/ai/conversations (anon)", resp, expect=401, note="no auth → 401")
    resp = anon.get("/orgs")
    record("GET", "/orgs (anon)", resp, expect=401, note="no auth → 401")
    anon.close()


# ╔══════════════════════════════════════════════════════════════╗
# ║ 14. WEBSOCKET (quick probe)                                ║
# ╚══════════════════════════════════════════════════════════════╝
def test_websocket():
    print("\n── 14. WebSocket (Realtime Gateway) ──")
    # Realtime gateway runs on NodePort 30090 inside the kind cluster.
    # kind only maps 30080→18080 (api-gateway); 30090 is not host-mapped.
    # We verify the pod is running via kubectl instead.
    import subprocess

    try:
        out = subprocess.check_output(
            [
                "kubectl",
                "--context",
                "kind-management",
                "-n",
                "management",
                "get",
                "deploy/realtime-gateway",
                "-o",
                "jsonpath={.status.readyReplicas}",
            ],
            timeout=10,
            text=True,
        )
        ready = int(out) if out.strip() else 0
        ok = ready >= 1
        results.append(
            Result("WS", "/live/* (realtime-gateway pod)", 0, ok, note=f"{ready} replica(s) ready")
        )
        symbol = "✅" if ok else "❌"
        print(
            f"  {symbol} WS      /live/* (realtime-gateway pod)                    → {ready} replica(s) ready"
        )
    except Exception as e:
        results.append(
            Result(
                "WS", "/live/* (realtime-gateway pod)", 0, False, note=f"kubectl check failed: {e}"
            )
        )
        print(f"  ❌ WS      /live/* (realtime-gateway pod)                    → error: {e}")


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════
def main():
    print("=" * 72)
    print("  KubeHeal API Integration Test")
    print(f"  Target: {BASE}")
    print("=" * 72)

    c = httpx.Client(base_url=BASE, timeout=15)
    try:
        test_health(c)
        test_auth(c)
        # re-login after auth tests (logout happened inside)
        test_identity_admin(c)
        test_providers_catalog(c)
        cluster_id = test_targets(c)
        test_inventory(c, cluster_id)
        test_ai(c)
        test_applications(c)
        test_dashboard(c)
        test_dead_letters(c)
        test_commands(c, cluster_id)
        test_gitops(c)
        test_errors(c)
        test_websocket()
    finally:
        c.close()

    # ── summary ──────────────────────────────────────────────
    print("\n" + "=" * 72)
    total = len(results)
    passed = sum(1 for r in results if r.ok)
    failed = sum(1 for r in results if not r.ok)
    print(f"  TOTAL: {total}  |  PASSED: {passed}  |  FAILED: {failed}")
    print("=" * 72)

    if failed:
        print("\n❌ FAILED ENDPOINTS:")
        for r in results:
            if not r.ok:
                print(f"  {r.method:7s} {r.path:60s} → {r.status} (expected different)  {r.note}")
                if r.body_snippet:
                    print(f"          body: {r.body_snippet[:150]}")
        print()

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
