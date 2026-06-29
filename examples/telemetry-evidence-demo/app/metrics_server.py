from __future__ import annotations

import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

START_TIME = time.time()


def metric_text() -> str:
    elapsed = int(time.time() - START_TIME)
    restart_total = 4 + (elapsed // 30)
    http_5xx_rate = 0.19
    cpu_ratio = 0.83
    memory_pressure = 1

    return "\n".join(
        [
            "# HELP demo_pod_restart_total Demo pod restart count.",
            "# TYPE demo_pod_restart_total counter",
            (f'demo_pod_restart_total{{namespace="sandbox",pod="checkout-api"}} {restart_total}'),
            "# HELP demo_http_5xx_rate Demo HTTP 5xx rate.",
            "# TYPE demo_http_5xx_rate gauge",
            (f'demo_http_5xx_rate{{namespace="sandbox",pod="checkout-api"}} {http_5xx_rate}'),
            "# HELP demo_node_cpu_usage_ratio Demo node CPU usage ratio.",
            "# TYPE demo_node_cpu_usage_ratio gauge",
            f'demo_node_cpu_usage_ratio{{node="worker-1"}} {cpu_ratio}',
            "# HELP demo_node_memory_pressure Demo node memory pressure.",
            "# TYPE demo_node_memory_pressure gauge",
            f'demo_node_memory_pressure{{node="worker-1"}} {memory_pressure}',
            "",
        ]
    )


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/healthz":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
            return

        if self.path != "/metrics":
            self.send_response(404)
            self.end_headers()
            return

        body = metric_text().encode("utf-8")
        self.send_response(200)
        self.send_header(
            "Content-Type",
            "text/plain; version=0.0.4; charset=utf-8",
        )
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args: object) -> None:
        return


def main() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", 8000), Handler)
    print("demo metrics server listening on :8000", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
