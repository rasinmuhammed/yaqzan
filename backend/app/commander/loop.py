"""CommanderLoop: orchestrates one K2 reasoning cycle per N ticks.

Cycles are strictly sequential. If the sim outpaces the commander, we
skip to the latest snapshot and note the skip in the trace. A failed
parse gets one repair round-trip; a second failure degrades the cycle
(previous plan stands) — the loop never crashes.
"""
from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any

from ..sim.engine import SimulationEngine, StateSnapshot
from ..trace.store import TraceStore
from .k2_client import CommanderClient
from .prompts import REPAIR_PROMPT, SYSTEM_PROMPT, compact_world_state, cycle_user_prompt
from .schema import CommandPlan, Directive, extract_plan
from .verifier import Verifier

Emit = Callable[[str, dict[str, Any]], Awaitable[None]]


class CommanderLoop:
    def __init__(
        self,
        engine: SimulationEngine,
        client: CommanderClient,
        trace: TraceStore,
        emit: Emit,
        cycle_ticks: int = 3,
    ) -> None:
        self.engine = engine
        self.client = client
        self.trace = trace
        self.emit = emit
        self.cycle_ticks = cycle_ticks
        self.verifier = Verifier(engine)

        self.cycle = 0
        self.previous_plan: CommandPlan | None = None
        self.verifier_feedback: list[str] = []
        self.last_cycle_tick = 0
        self._running = False
        self._last_event_log_len = 0
        self.overridden: set[str] = set()  # directive keys vetoed by the operator
        # Human-in-the-loop authority. "supervised": nothing executes until
        # the operator accepts it; "delegated": verified directives execute,
        # operator keeps per-directive override.
        self.authority: str = "supervised"
        self.pending: dict[str, Directive] = {}  # "{cycle}:{id}" -> directive
        self.history: list[dict[str, Any]] = []

    def cycle_due(self, snap: StateSnapshot) -> bool:
        if self._running:
            return False
        if snap.tick - self.last_cycle_tick >= self.cycle_ticks:
            return True
        return any(
            i.severity == "critical" and i.tick == snap.tick for i in snap.active_injects
        )

    async def run_cycle(self, snap: StateSnapshot) -> None:
        self._running = True
        self.cycle += 1
        self.last_cycle_tick = snap.tick
        try:
            await self._run_cycle_inner(snap)
        except Exception as e:
            self.trace.append({"type": "cycle_error", "cycle": self.cycle, "error": str(e)})
            await self.emit("cycle_degraded", {"cycle": self.cycle, "reason": str(e)})
        finally:
            self._running = False

    async def _run_cycle_inner(self, snap: StateSnapshot) -> None:
        started = time.monotonic()
        shelters = {
            n.id: n.shelter_capacity for n in self.engine.city.nodes.values() if n.is_shelter
        }
        world = compact_world_state(snap, self.engine.city.name, shelters)
        deltas = self._deltas()
        user = cycle_user_prompt(world, self.cycle, self.previous_plan, deltas, self.verifier_feedback)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user},
        ]
        await self.emit("cycle_start", {"cycle": self.cycle, "tick": snap.tick})

        reasoning_parts: list[str] = []
        content_parts: list[str] = []
        async for ev in self.client.stream(messages):
            if ev.kind == "reasoning":
                reasoning_parts.append(ev.text)
                await self.emit("reasoning_token", {"cycle": self.cycle, "text": ev.text})
            else:
                content_parts.append(ev.text)
        await self.emit("reasoning_done", {"cycle": self.cycle})
        completion = "".join(content_parts)

        plan = await self._parse_with_repair(messages, completion)
        if plan is None:
            self.trace.append({"type": "cycle_degraded", "cycle": self.cycle, "tick": snap.tick,
                               "reasoning": "".join(reasoning_parts), "raw": completion})
            await self.emit("cycle_degraded", {"cycle": self.cycle, "reason": "plan failed validation twice"})
            return

        plan.cycle = self.cycle
        self.verifier_feedback = self.verifier.verify_plan(plan)
        elapsed = time.monotonic() - started
        # Rough token estimate for the speed readout (chars/4 is close enough).
        tokens = (len("".join(reasoning_parts)) + len(completion)) // 4
        await self.emit("plan", {
            "cycle": self.cycle, "plan": plan.model_dump(),
            "meta": {"elapsed_s": round(elapsed, 1), "tokens": tokens},
        })

        # Unapproved directives from the previous cycle expire on replan.
        if self.pending:
            self.trace.append({
                "type": "directives_expired",
                "keys": sorted(self.pending), "at_cycle": self.cycle,
            })
            self.pending.clear()

        applied = []
        for d in plan.directives:
            if not d.verified:
                continue
            key = f"{self.cycle}:{d.id}"
            if key in self.overridden:
                continue
            if self.authority == "supervised":
                self.pending[key] = d
            else:
                self._apply(d)
                applied.append(d.id)
        if applied:
            await self.emit("directives_applied", {
                "cycle": self.cycle, "directive_ids": applied, "by": "auto"})

        record = {
            "type": "cycle", "cycle": self.cycle, "tick": snap.tick,
            "deltas": deltas, "reasoning": "".join(reasoning_parts),
            "plan": plan.model_dump(), "applied": applied,
            "verifier_feedback": self.verifier_feedback,
        }
        self.trace.append(record)
        self.history.append(record)
        self.previous_plan = plan

    async def _parse_with_repair(self, messages: list[dict], completion: str) -> CommandPlan | None:
        try:
            return extract_plan(completion, self.cycle)
        except ValueError as first_err:
            repair = messages + [
                {"role": "assistant", "content": completion},
                {"role": "user", "content": REPAIR_PROMPT.format(error=first_err)},
            ]
            parts: list[str] = []
            try:
                async for ev in self.client.stream(repair):
                    if ev.kind == "content":
                        parts.append(ev.text)
                return extract_plan("".join(parts), self.cycle)
            except (ValueError, RuntimeError):
                return None

    async def accept(self, cycle: int, directive_id: str, operator: str = "operator") -> bool:
        """Operator approval in supervised mode: execute one pending directive."""
        key = f"{cycle}:{directive_id}"
        d = self.pending.pop(key, None)
        if d is None or key in self.overridden:
            return False
        self._apply(d)
        self.trace.append({"type": "directive_accepted", "key": key, "by": operator})
        await self.emit("directives_applied", {
            "cycle": cycle, "directive_ids": [directive_id], "by": operator})
        return True

    async def accept_all(self, cycle: int) -> list[str]:
        ids = [k.split(":", 1)[1] for k in sorted(self.pending) if k.startswith(f"{cycle}:")]
        applied = [i for i in ids if await self.accept(cycle, i)]
        return applied

    def override(self, cycle: int, directive_id: str) -> None:
        key = f"{cycle}:{directive_id}"
        self.overridden.add(key)
        self.pending.pop(key, None)
        self.trace.append({"type": "directive_overridden", "key": key, "by": "operator"})

    def _deltas(self) -> list[str]:
        new_events = self.engine.event_log[self._last_event_log_len:]
        self._last_event_log_len = len(self.engine.event_log)
        return new_events[-12:]

    def _apply(self, d: Directive) -> None:
        eng = self.engine
        if d.action == "evacuate":
            eng.order_evacuation(d.target)
            for uid in d.params.get("using", []):
                if uid in eng.unit_mgr.units:
                    eng.unit_mgr.assign(uid, d.target, d.params.get("to"), shuttle=True)
        elif d.action in ("move_unit", "stage_resource"):
            dest = d.params.get("to") or d.params.get("at")
            if dest:
                eng.unit_mgr.assign(d.target, dest, None)
        elif d.action == "close_route":
            eng.close_route(d.target)
        elif d.action == "broadcast_alert":
            eng.broadcast_alert(d.params.get("message", ""), d.target)
        elif d.action == "medical_priority":
            other = next(
                (n.id for n in eng.city.nodes.values() if n.is_hospital and n.id != d.target),
                None,
            )
            for uid in d.params.get("using", []):
                if uid in eng.unit_mgr.units and other:
                    eng.unit_mgr.assign(uid, d.target, other, shuttle=True)
        # open_shelter is informational: shelters accept arrivals via deliveries.
