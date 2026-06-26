from __future__ import annotations

from gateway import create_app

from packages.runtime.service import FastApiService

SERVICE_NAME = "management-api-gateway"


def main() -> None:
    FastApiService(SERVICE_NAME, create_app).run()


if __name__ == "__main__":
    main()
