"""console nginx 프록시 경로 보존 회귀.

변수 기반 proxy_pass 에 URI 를 붙이면 그 URI 가 원 요청 경로 전체를 대체한다.
WS 블록의 `proxy_pass $realtime_upstream/live/` 는 `/api/live/browser` 를
`/live/` 로 뭉개(하위 경로·query 소실) realtime-gateway 라우트 불일치로
handshake 403 을 만들었다(라이브 access log `"WebSocket /live/" 403` 실증).
REST 블록은 동일 결함을 `$request_uri` 보존으로 이미 고정했다.
"""

from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]

NGINX_SOURCES = (
    "deploy/management/console-dev.yaml",
    "frontend/nginx.conf",
)


def read(path: str) -> str:
    return (ROOT_DIR / path).read_text(encoding="utf-8")


def test_ws_location_preserves_subpath_and_query() -> None:
    for path in NGINX_SOURCES:
        source = read(path)
        # 변수+URI 형태는 하위 경로/query 를 소실시키므로 금지한다.
        assert "proxy_pass $realtime_upstream/live/" not in source, path
        # 접두만 치환하는 rewrite 로 /api/live/* -> /live/* 를 보존한다.
        assert "rewrite ^/api/live/(.*)$ /live/$1 break;" in source, path
        assert "proxy_pass $realtime_upstream;" in source, path


def test_rest_location_preserves_request_uri() -> None:
    for path in NGINX_SOURCES:
        source = read(path)
        assert "proxy_pass $api_upstream$request_uri;" in source, path
        assert "proxy_pass $api_upstream/" not in source, path


def test_ws_location_keeps_upgrade_headers() -> None:
    for path in NGINX_SOURCES:
        source = read(path)
        assert "proxy_set_header Upgrade $http_upgrade;" in source, path
        assert 'proxy_set_header Connection "upgrade";' in source, path
