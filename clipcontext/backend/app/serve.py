"""API entry point that works on Windows, macOS and Linux: `python -m app.serve`."""

from __future__ import annotations

import argparse

import uvicorn

from app.core import runtime


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the ClipContext API")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    config = uvicorn.Config("app.api.main:app", host=args.host, port=args.port, loop="none")
    runtime.run(uvicorn.Server(config).serve())


if __name__ == "__main__":
    main()
