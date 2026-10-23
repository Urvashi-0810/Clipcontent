"""Event-loop selection.

psycopg's async mode cannot run on Windows' default ProactorEventLoop, and uvicorn
picks ProactorEventLoop on Windows. All entry points therefore run on a
SelectorEventLoop, which works on every platform.
"""

from __future__ import annotations

import asyncio
import sys
from typing import Any, Coroutine


def loop_factory():
    return asyncio.SelectorEventLoop if sys.platform == "win32" else None


def run(coro: Coroutine[Any, Any, Any]) -> Any:
    with asyncio.Runner(loop_factory=loop_factory()) as runner:
        return runner.run(coro)
