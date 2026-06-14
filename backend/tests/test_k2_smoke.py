"""Integration smoke test against the real K2 endpoint.

Skipped unless K2 env vars are set. First run: execute together with the
owner and read the printed raw response shape, then adapt the parser in
k2_client.py if the trace format differs from both handled variants.

    K2_BASE_URL=... K2_API_KEY=... K2_MODEL=... pytest tests/test_k2_smoke.py -s
"""
import os

import pytest

from app.commander.k2_client import K2Client
from app.config import Settings

requires_k2 = pytest.mark.skipif(
    not (os.getenv("K2_BASE_URL") and os.getenv("K2_API_KEY") and os.getenv("K2_MODEL")),
    reason="K2 credentials not configured",
)


@requires_k2
@pytest.mark.asyncio
async def test_k2_smoke_prints_response_shape():
    client = K2Client(Settings())
    reasoning, content = [], []
    async for ev in client.stream([
        {"role": "user", "content": "Reason briefly, then answer: what is 17 * 23? "
                                    "Put the final answer in a fenced ```json block as {\"answer\": N}."}
    ]):
        (reasoning if ev.kind == "reasoning" else content).append(ev.text)
    await client.close()

    print("\n--- REASONING (", len(reasoning), "events ) ---")
    print("".join(reasoning)[:1500])
    print("--- CONTENT ---")
    print("".join(content)[:1500])
    assert content, "no content received — inspect raw stream format"
