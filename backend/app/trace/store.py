"""Append-only JSONL trace of commander cycles — the audit trail."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any


class TraceStore:
    def __init__(self, trace_dir: str, run_id: str | None = None) -> None:
        Path(trace_dir).mkdir(parents=True, exist_ok=True)
        rid = run_id or time.strftime("%Y%m%d-%H%M%S")
        self.path = Path(trace_dir) / f"run-{rid}.jsonl"

    def append(self, record: dict[str, Any]) -> None:
        record["ts"] = time.time()
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
