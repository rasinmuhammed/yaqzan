"""Async K2 Think V2 client (OpenAI-compatible chat completions, streaming).

Built behind a small interface (CommanderClient) because the exact
response shape is unknown until API access arrives. Handles BOTH trace
formats: a separate `reasoning_content` delta field and inline
<think>...</think> tags. Retries with exponential backoff.
"""
from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Literal, Protocol

import httpx

from ..config import Settings


@dataclass
class StreamEvent:
    kind: Literal["reasoning", "content"]
    text: str


class CommanderClient(Protocol):
    async def stream(self, messages: list[dict]) -> AsyncIterator[StreamEvent]: ...


class K2Client:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client = httpx.AsyncClient(
            base_url=settings.k2_base_url,
            headers={"Authorization": f"Bearer {settings.k2_api_key}"},
            timeout=httpx.Timeout(settings.k2_timeout_s, connect=15.0),
        )

    async def stream(self, messages: list[dict]) -> AsyncIterator[StreamEvent]:
        last_err: Exception | None = None
        for attempt in range(self.settings.k2_max_retries):
            try:
                async for ev in self._stream_once(messages):
                    yield ev
                return
            except (httpx.HTTPError, json.JSONDecodeError) as e:
                last_err = e
                await asyncio.sleep(2**attempt)
        raise RuntimeError(f"K2 request failed after retries: {last_err}")

    async def _stream_once(self, messages: list[dict]) -> AsyncIterator[StreamEvent]:
        payload = {
            "model": self.settings.k2_model,
            "messages": messages,
            "stream": True,
            "max_tokens": 16384,
            "temperature": 0.6,
        }
        in_think = False
        # K2 Think V2 (verified via smoke test 2026-06-12): no reasoning field,
        # no <think> tags. The CoT arrives as plain content with the plan in a
        # trailing fenced block. We surface everything as "reasoning" until the
        # first code fence, then switch to "content" for the parser.
        fence = _FenceSplitter()
        async with self._client.stream("POST", "/chat/completions", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                choices = json.loads(data).get("choices") or []
                if not choices:  # usage/keepalive chunks carry no choices
                    continue
                delta = choices[0].get("delta") or {}
                # Format A: dedicated reasoning field.
                reasoning = delta.get("reasoning_content") or delta.get("reasoning")
                if reasoning:
                    yield StreamEvent("reasoning", reasoning)
                content = delta.get("content")
                if not content:
                    continue
                if "<think>" in content or in_think:
                    # Format B: inline <think> tags.
                    for kind, text in _split_think(content, in_think):
                        if text:
                            yield StreamEvent(kind, text)
                    in_think = _track_think_state(content, in_think)
                else:
                    # Format C: bare CoT content, plan in trailing fence.
                    for ev in fence.feed(content):
                        yield ev
        for ev in fence.flush():
            yield ev

    async def stream_raw(self, messages: list[dict]) -> AsyncIterator[StreamEvent]:
        """Conversational stream, no fence splitting: dedicated reasoning
        fields surface as reasoning, all plain content as content. The chat
        handler does its own thinking/answer split."""
        payload = {
            "model": self.settings.k2_model,
            "messages": messages,
            "stream": True,
            # K2-Think reasons verbosely; 4096 truncated before it reached a
            # clean answer. Give it room to actually conclude.
            "max_tokens": 8192,
            "temperature": 0.7,
        }
        async with self._client.stream("POST", "/chat/completions", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                choices = json.loads(data).get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                reasoning = delta.get("reasoning_content") or delta.get("reasoning")
                if reasoning:
                    yield StreamEvent("reasoning", reasoning)
                if delta.get("content"):
                    yield StreamEvent("content", delta["content"])

    async def close(self) -> None:
        await self._client.aclose()


class _FenceSplitter:
    """Streams text as reasoning until the first ``` fence, content after.

    Holds back a small tail so a fence split across chunks is not missed.
    """

    def __init__(self) -> None:
        self.in_content = False
        self.buf = ""

    def feed(self, chunk: str) -> list[StreamEvent]:
        if self.in_content:
            return [StreamEvent("content", chunk)]
        self.buf += chunk
        idx = self.buf.find("```")
        if idx != -1:
            out = []
            if self.buf[:idx]:
                out.append(StreamEvent("reasoning", self.buf[:idx]))
            out.append(StreamEvent("content", self.buf[idx:]))
            self.in_content = True
            self.buf = ""
            return out
        # Emit all but the last 3 chars (a fence may be straddling the boundary).
        safe, self.buf = self.buf[:-3], self.buf[-3:]
        return [StreamEvent("reasoning", safe)] if safe else []

    def flush(self) -> list[StreamEvent]:
        if self.buf and not self.in_content:
            out = [StreamEvent("reasoning", self.buf)]
            self.buf = ""
            return out
        return []


def _split_think(chunk: str, in_think: bool) -> list[tuple[Literal["reasoning", "content"], str]]:
    out: list[tuple[Literal["reasoning", "content"], str]] = []
    rest = chunk
    state = in_think
    while rest:
        tag = "</think>" if state else "<think>"
        idx = rest.find(tag)
        if idx == -1:
            out.append(("reasoning" if state else "content", rest))
            break
        out.append(("reasoning" if state else "content", rest[:idx]))
        rest = rest[idx + len(tag):]
        state = not state
    return out


def _track_think_state(chunk: str, in_think: bool) -> bool:
    state = in_think
    rest = chunk
    while True:
        tag = "</think>" if state else "<think>"
        idx = rest.find(tag)
        if idx == -1:
            return state
        rest = rest[idx + len(tag):]
        state = not state
