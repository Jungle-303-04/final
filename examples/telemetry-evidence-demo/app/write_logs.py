from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request


LOKI_URL = os.environ.get("LOKI_URL", "http://localhost:3100")
LOG_FILE = os.environ.get("LOG_FILE", "/tmp/demo-app.log")


def push_to_loki(line: str) -> None:
    now_ns = str(int(time.time() * 1_000_000_000))
    payload = {
        "streams": [
            {
                "stream": {
                    "service": "checkout-api",
                    "namespace": "sandbox",
                    "pod": "checkout-api",
                    "level": "error",
                },
                "values": [[now_ns, line]],
            }
        ]
    }
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{LOKI_URL}/loki/api/v1/push",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        response.read()


def append_file(line: str) -> None:
    with open(LOG_FILE, "a", encoding="utf-8") as file:
        file.write(line + "\n")


def main() -> None:
    messages = [
        "ERROR readiness check failed: downstream timeout",
        "ERROR readiness check failed: downstream timeout",
        "WARN rollback candidate detected",
    ]
    index = 0
    while True:
        line = messages[index % len(messages)]
        append_file(line)
        try:
            push_to_loki(line)
            print(f"pushed log to loki: {line}", flush=True)
        except (urllib.error.URLError, TimeoutError) as exc:
            print(f"waiting for loki: {exc}", flush=True)
        index += 1
        time.sleep(5)


if __name__ == "__main__":
    main()
