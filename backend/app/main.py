"""Yaqzan backend: FastAPI app, WebSocket endpoint, sim + commander lifecycle.

One sim session shared by all connected clients (it's a war room, not a
SaaS). Control messages: start, pause, set_speed, override_directive,
inject (film mode manual triggers), load_scenario (hot-swap scenario).
"""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .commander.k2_client import CommanderClient, K2Client
from .commander.loop import CommanderLoop
from .commander.scripted import ScriptedCommander
from .config import get_settings
from .sim.engine import SCENARIO_DIR, SimulationEngine
from .trace.store import TraceStore

log = logging.getLogger("yaqzan")
logging.basicConfig(level=logging.INFO)


class Hub:
    """Broadcasts events to all connected war-room clients."""

    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()

    async def broadcast(self, type_: str, payload: dict[str, Any]) -> None:
        msg = json.dumps({"type": type_, **payload}, default=str)
        dead = []
        for ws in self.clients:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)


class Session:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.hub = Hub()
        self.engine = SimulationEngine(SCENARIO_DIR / self.settings.scenario, seed=self.settings.seed)
        self.trace = TraceStore(self.settings.trace_dir)
        self.client: CommanderClient = (
            K2Client(self.settings) if self.settings.k2_configured else ScriptedCommander()
        )
        self.commander_name = "k2" if self.settings.k2_configured else "scripted"
        self.loop = CommanderLoop(
            self.engine, self.client, self.trace, self.hub.broadcast,
            cycle_ticks=self.settings.commander_cycle_ticks,
        )
        self.running = False
        self.tick_seconds = self.settings.tick_seconds
        self._task: asyncio.Task | None = None
        self._commander_task: asyncio.Task | None = None
        self._gen_task: asyncio.Task | None = None
        # Verified rescue ops the agent proposed for citizen reports, awaiting
        # operator approval (keyed by report id).
        self.report_ops: dict[str, Any] = {}
        # Recent reports, for de-duplication — the documented failure of the
        # 2018 keralarescue.in effort (~25% of requests were duplicates).
        self.recent_reports: list[dict[str, Any]] = []
        self.report_seq = 100  # monotonic id source (above the seeded demo ids)

    def reset(self) -> None:
        authority = self.loop.authority
        self.engine = SimulationEngine(SCENARIO_DIR / self.settings.scenario, seed=self.settings.seed)
        if not self.settings.k2_configured:
            self.client = ScriptedCommander()  # scripted commander carries per-run state
        self.loop = CommanderLoop(
            self.engine, self.client, self.trace, self.hub.broadcast,
            cycle_ticks=self.settings.commander_cycle_ticks,
        )
        self.loop.authority = authority

    async def run(self) -> None:
        while True:
            if not self.running or self.engine.tick >= self.engine.max_ticks:
                await asyncio.sleep(0.2)
                continue
            if (
                self.settings.commander_sync
                and self._commander_task is not None
                and not self._commander_task.done()
            ):
                # Sync pacing: sim time holds while the commander reasons,
                # so the disaster never outruns its commander.
                await asyncio.sleep(0.2)
                continue
            snap = self.engine.step()
            for inj in (i for i in self.engine.injects if i.tick == snap.tick):
                await self.hub.broadcast("inject", {"inject": inj.model_dump()})
            await self.hub.broadcast("state_snapshot", {"snapshot": snap.model_dump()})

            if self.loop.cycle_due(snap) and (self._commander_task is None or self._commander_task.done()):
                # Commander runs concurrently with the sim; cycles never overlap.
                self._commander_task = asyncio.create_task(self.loop.run_cycle(snap))
            await asyncio.sleep(self.tick_seconds)

    async def handle(self, msg: dict[str, Any], ws: WebSocket | None = None) -> None:
        cmd = msg.get("cmd")
        if cmd == "start":
            self.running = True
            await self.hub.broadcast("sim_status", {"running": True})
        elif cmd == "pause":
            self.running = False
            await self.hub.broadcast("sim_status", {"running": False})
        elif cmd == "reset":
            self.running = False
            self.reset()
            self.recent_reports.clear()
            self.report_ops.clear()
            self.report_seq = 100
            await self.hub.broadcast("sim_status", {"running": False})
            await self.hub.broadcast("state_snapshot", {"snapshot": self.engine.snapshot().model_dump()})
        elif cmd == "jump_time":
            target = min(self.engine.max_ticks, self.engine.tick + 15)
            while self.engine.tick < target:
                self.engine.step()
            self.loop.last_cycle_tick = target
            await self.hub.broadcast("state_snapshot", {"snapshot": self.engine.snapshot().model_dump()})
        elif cmd == "load_scenario":
            scenario = msg.get("scenario", "")
            path = SCENARIO_DIR / scenario
            if path.exists() and path.suffix == ".json":
                self.running = False
                authority = self.loop.authority
                self.settings.scenario = scenario
                self.engine = SimulationEngine(path, seed=self.settings.seed)
                if not self.settings.k2_configured:
                    self.client = ScriptedCommander()
                self.loop = CommanderLoop(
                    self.engine, self.client, self.trace, self.hub.broadcast,
                    cycle_ticks=self.settings.commander_cycle_ticks,
                )
                self.loop.authority = authority
                log.info("Scenario switched to %s", scenario)
                await self.hub.broadcast("scenario_loaded", {"scenario": scenario})
                await self.hub.broadcast("sim_status", {"running": False})
                snap = self.engine.snapshot().model_dump()
                await self.hub.broadcast("state_snapshot", {"snapshot": snap})
                # Resend city graph for new scenario data
                await self.hub.broadcast("city_update", {
                    "city": {
                        "name": self.engine.city.name,
                        "nodes": [n.model_dump() for n in self.engine.city.nodes.values()],
                        "edges": [e.model_dump() for e in self.engine.city.edges.values()],
                        "injects": [i.model_dump(exclude={"effect"}) for i in self.engine.injects],
                    }
                })
        elif cmd == "set_speed":
            self.tick_seconds = max(0.3, min(10.0, float(msg.get("seconds", 2.0))))
        elif cmd == "override_directive":
            self.loop.override(int(msg.get("cycle", 0)), str(msg.get("directive_id", "")))
            await self.hub.broadcast("directive_overridden", {
                "cycle": msg.get("cycle"), "directive_id": msg.get("directive_id")})
        elif cmd == "accept_directive":
            await self.loop.accept(int(msg.get("cycle", 0)), str(msg.get("directive_id", "")))
        elif cmd == "accept_all":
            await self.loop.accept_all(int(msg.get("cycle", 0)))
        elif cmd == "set_authority":
            mode = msg.get("mode", "supervised")
            if mode in ("supervised", "delegated"):
                self.loop.authority = mode
                if mode == "delegated" and self.loop.pending:
                    # Delegating mid-cycle executes what the verifier already passed.
                    cycles = {int(k.split(":", 1)[0]) for k in self.loop.pending}
                    for c in sorted(cycles):
                        await self.loop.accept_all(c)
                await self.hub.broadcast("authority", {"mode": mode})
        elif cmd == "trigger_inject":
            # Film mode: fire a scenario inject now regardless of its tick.
            inj = next((i for i in self.engine.injects if i.id == msg.get("inject_id")), None)
            if inj and inj not in self.engine.active_injects:
                self.engine.apply_inject(inj)
                await self.hub.broadcast("inject", {"inject": inj.model_dump()})
        elif cmd == "chat_query":
            question = msg.get("question", "")
            if question:
                asyncio.create_task(self._handle_chat(ws, question))
        elif cmd == "generate_scenario":
            prompt = str(msg.get("prompt", "")).strip()
            if prompt and (self._gen_task is None or self._gen_task.done()):
                self._gen_task = asyncio.create_task(self._generate_scenario(prompt))
        elif cmd == "citizen_report":
            report = msg.get("report") or {}
            if report.get("description") or report.get("location"):
                asyncio.create_task(self._handle_citizen_report(ws, report))
        elif cmd == "accept_report_op":
            await self._accept_report_op(str(msg.get("report_id", "")))
        elif cmd == "live_event":
            text = str(msg.get("text", "")).strip()
            if text:
                asyncio.create_task(self._handle_live_event(text))

    async def _generate_scenario(self, prompt: str) -> None:
        """Prompt-to-disaster: K2 designs a scenario, validated and saved, then loaded.

        Same reliability pattern as the commander loop: schema parse, one
        repair round-trip, designed failure state. Never crashes the session.
        """
        from .commander import scenario_gen as sg
        await self.hub.broadcast("scenario_gen_started", {"prompt": prompt})
        try:
            base = json.loads((SCENARIO_DIR / "kuttanad_monsoon.json").read_text())
            city = self.engine.city
            if not self.settings.k2_configured:
                gen = sg.scripted_fallback(prompt, city)
                await self.hub.broadcast("scenario_gen_reasoning", {
                    "text": "Offline designer: parameterizing the flood template from the prompt "
                            "(intensity keywords set the surge rate; the seed is derived from the text)."})
            else:
                messages = [
                    {"role": "system", "content": sg.DESIGNER_SYSTEM},
                    {"role": "user", "content": f"CITY:\n{sg.city_digest(city)}\n\nDISASTER BRIEF:\n{prompt}"},
                ]
                gen = await self._gen_with_repair(sg, messages, city)
            errors = sg.validate_against_city(gen, city)
            if errors:
                raise ValueError("; ".join(errors[:6]))
            scenario = sg.assemble_scenario(gen, base, prompt)
            fname = sg.save_generated(scenario, SCENARIO_DIR)
            await self.hub.broadcast("scenario_gen_done", {
                "scenario_id": fname, "name": gen.name, "description": gen.description,
                "ticks": gen.ticks, "inject_count": len(gen.injects),
            })
            await self.handle({"cmd": "load_scenario", "scenario": fname})
        except Exception as e:
            log.error("Scenario generation failed: %s", e)
            await self.hub.broadcast("scenario_gen_failed", {"error": str(e)[:300]})

    async def _gen_with_repair(self, sg, messages: list[dict], city) -> "object":
        """Stream the designer's reasoning, parse, repair once on failure."""
        completion: list[str] = []
        async for ev in self.client.stream(messages):
            if ev.kind == "reasoning":
                await self.hub.broadcast("scenario_gen_reasoning", {"text": ev.text})
            else:
                completion.append(ev.text)
        try:
            gen = sg.parse_generated("".join(completion))
            errors = sg.validate_against_city(gen, city)
            if errors:
                raise ValueError("; ".join(errors))
            return gen
        except ValueError as first_err:
            await self.hub.broadcast("scenario_gen_reasoning", {
                "text": f"\n[validator] {str(first_err)[:200]}\n[validator] requesting corrected JSON…\n"})
            repair = messages + [
                {"role": "assistant", "content": "".join(completion)},
                {"role": "user", "content": f"Your scenario failed validation:\n{first_err}\n\n"
                                            "Re-emit ONLY the corrected fenced ```json block. No prose."},
            ]
            parts: list[str] = []
            async for ev in self.client.stream(repair):
                if ev.kind == "content":
                    parts.append(ev.text)
            return sg.parse_generated("".join(parts))

    async def _handle_live_event(self, text: str) -> None:
        """Operator throws a curveball in plain language; K2 interprets it into
        real simulation effects, applies them live, and the commander must
        replan against the changed world. Adaptive reasoning, on demand."""
        from .commander import scenario_gen as sg
        from .commander.schema import FENCED_JSON
        from .sim.engine import Inject

        await self.hub.broadcast("live_event_started", {"text": text})
        city = self.engine.city
        try:
            if not self.settings.k2_configured:
                headline, severity, effect = self._scripted_event(text, city)
            else:
                from .commander.prompts import compact_world_state
                snap = self.engine.snapshot()
                shelters = {n.id: n.shelter_capacity for n in city.nodes.values() if n.is_shelter}
                context = compact_world_state(snap, city.name, shelters)
                node_ids = ", ".join(sorted(city.nodes))
                edge_ids = ", ".join(sorted(self.engine.city.edges))
                messages = [
                    {"role": "system", "content": (
                        "You are the simulation's event interpreter for the Kuttanad flood. An operator "
                        "injects a real-world event in plain language. Convert it into ONE simulation "
                        "effect using ONLY real ids from the lists below — never the words 'node' or "
                        "'meters' literally. Reason briefly (under 60 words), then output EXACTLY one "
                        "fenced ```json block.\n\n"
                        "Allowed effect keys: water_spike (object mapping a real NODE ID to a metre rise "
                        "0.3-1.5), surge_rate_m (number -0.15..0.4), destroy_edge (a real EDGE ID), "
                        "hospital_generator_down (a hospital node id), power_outage (list of node ids), "
                        "cell_degradation (integer 20-100), contaminate (list of node ids), "
                        "add_water_source (a node id), crowd_surge (object with target node id and people 100-5000).\n\n"
                        "EXAMPLE for 'a bund broke at Pandanad and the power failed in Kavalam':\n"
                        '```json\n{"headline": "Bund breach at Pandanad; grid down in Kavalam", '
                        '"severity": "critical", "effect": {"water_spike": {"pandanad": 1.2}, '
                        '"power_outage": ["kavalam"]}}\n```\n\n'
                        f"NODE IDS: {node_ids}\nEDGE IDS: {edge_ids}\n\nCURRENT SITUATION:\n{context}"
                    )},
                    {"role": "user", "content": f"OPERATOR EVENT: {text}"},
                ]
                headline, severity, effect = await self._interpret_event(messages, FENCED_JSON)
                # One repair round-trip if the model used invalid ids.
                errs = sg.validate_effect(effect or {}, city) if effect else ["no effect produced"]
                if not effect or errs:
                    repair = messages + [
                        {"role": "user", "content": (
                            f"That was invalid: {'; '.join(errs)}. Re-emit ONLY one corrected fenced "
                            "json block, using REAL node/edge ids from the lists. No prose.")},
                    ]
                    headline, severity, effect = await self._interpret_event(repair, FENCED_JSON)

            errors = sg.validate_effect(effect or {}, city)
            if not effect or errors:
                await self.hub.broadcast("live_event_failed", {
                    "error": "; ".join(errors) or "could not interpret event into a valid effect"})
                return
            inj = Inject(tick=self.engine.tick, id=f"live_{self.engine.tick}_{len(self.engine.active_injects)}",
                         severity=severity or "high", headline=headline or text[:80], effect=effect)
            self.engine.apply_inject(inj)
            self.trace.append({"type": "live_event", "text": text, "inject": inj.model_dump()})
            await self.hub.broadcast("inject", {"inject": inj.model_dump()})
            await self.hub.broadcast("live_event_applied", {"headline": inj.headline, "effect": effect})
        except Exception as e:
            log.error("Live event error: %s", e)
            await self.hub.broadcast("live_event_failed", {"error": str(e)[:200]})

    async def _interpret_event(self, messages: list[dict], fenced):
        """Stream the model's interpretation (reasoning shown live) and parse it."""
        completion, buf, in_fence = "", "", False
        stream = getattr(self.client, "stream_raw", self.client.stream)
        async for ev in stream(messages):
            if ev.kind == "reasoning":
                await self.hub.broadcast("live_event_reasoning", {"text": ev.text})
                continue
            completion += ev.text
            if in_fence:
                continue
            buf += ev.text
            cut = buf.find("```")
            if cut != -1:
                pre = buf[:cut]
                if pre.strip():
                    await self.hub.broadcast("live_event_reasoning", {"text": pre})
                in_fence, buf = True, ""
            else:
                safe, buf = buf[:-3], buf[-3:]
                if safe:
                    await self.hub.broadcast("live_event_reasoning", {"text": safe})
        return self._parse_event(completion, fenced)

    def _parse_event(self, completion: str, fenced):
        matches = fenced.findall(completion)
        if not matches:
            return ("", "high", None)
        try:
            data = json.loads(matches[-1])
        except json.JSONDecodeError:
            return ("", "high", None)
        return (str(data.get("headline", "")), str(data.get("severity", "high")), data.get("effect"))

    def _scripted_event(self, text: str, city):
        """Offline keyword interpreter for live events."""
        t = text.lower()
        node = next((n for n in city.nodes.values()
                     if n.id in t or n.name.lower() in t), None)
        nid = node.id if node else sorted(city.nodes)[0]
        if "power" in t or "outage" in t or "grid" in t:
            return (f"Power failure reported near {city.nodes[nid].name}", "high", {"power_outage": [nid]})
        if "chemical" in t or "spill" in t or "contamin" in t or "fuel" in t:
            return (f"Contamination reported at {city.nodes[nid].name}", "high", {"contaminate": [nid]})
        if "phone" in t or "network" in t or "comms" in t or "signal" in t:
            return ("Mobile network degrading", "high", {"cell_degradation": 45})
        # default: a flood surge at the matched node
        return (f"Sudden surge at {city.nodes[nid].name}", "critical", {"water_spike": {nid: 1.0}})

    async def _handle_citizen_report(self, ws: WebSocket, report: dict[str, Any]) -> None:
        """Citizen reports an incident; the agent triages it live and proposes a
        concrete, verified rescue operation the operator can approve."""
        from .commander.prompts import compact_world_state
        from .commander.schema import Directive, FENCED_JSON
        from .commander.verifier import Verifier

        self.report_seq += 1
        rid = str(report.get("id") or f"RPT-{self.report_seq:03d}")
        report = {**report, "id": rid, "tick": self.engine.tick}

        # De-duplicate before spending a triage on it: if a recent report
        # already covers this place + incident type, merge instead of
        # re-triaging. This is exactly what 2018's crowdsourced effort lacked.
        dup_of = self._find_duplicate(report)
        await self.hub.broadcast("citizen_report", {"report": {**report, "duplicate_of": dup_of}})
        if dup_of:
            await self.hub.broadcast("report_duplicate", {"id": rid, "of": dup_of})
            return
        node = self._match_node(report)
        self.recent_reports.append({
            "id": rid, "type": report.get("type", ""),
            "node": node.id if node else (report.get("location", "") or "").lower().strip(),
            "tick": self.engine.tick,
        })
        self.recent_reports = self.recent_reports[-40:]
        try:
            snap = self.engine.snapshot()
            shelters = {n.id: n.shelter_capacity
                        for n in self.engine.city.nodes.values() if n.is_shelter}
            context = compact_world_state(snap, self.engine.city.name, shelters)
            loc, typ, desc = report.get("location", ""), report.get("type", ""), report.get("description", "")
            messages = [
                {"role": "system", "content": (
                    "You are Yaqzan, the AI triage layer for a public flood-reporting system in "
                    "Kuttanad. When official situational awareness is degraded, citizens report "
                    "incidents and you do two things: (1) reply to the citizen with an immediate, "
                    "calm, safe instruction, and (2) triage the report for responders with one "
                    "concrete rescue action. Use ONLY the world state below; never invent "
                    "towns or units.\n\n"
                    "SAFETY RULES for citizen instructions (always conservative): move to the "
                    "highest floor or roof; never enter or wade through floodwater; avoid "
                    "electrical fittings as water rises; signal rescuers from a window or roof "
                    "with bright cloth or a light; conserve phone battery and share exact "
                    "landmarks. Medical: keep the patient warm, dry and still.\n\n"
                    "DO NOT mention JSON or instructions. Jump straight into tactical deliberation "
                    "(cite town names, unit ids like boat_3, water depths). Then output EXACTLY ONE fenced ```json block:\n"
                    '{"citizen_instruction": "<calm, specific, action-first guidance to the '
                    'reporter, under 40 words>", "triage": "<1-2 sentence assessment for '
                    'responders>", "directive": {"action": "evacuate|move_unit|medical_priority|'
                    'broadcast_alert|open_shelter|close_route", "target": "<real node/unit/edge id>", '
                    '"params": {}, "rationale": "<why>", "urgency": "immediate|high|routine"}}\n'
                    "For evacuate use params {\"to\": \"<shelter node id>\", \"using\": [\"<unit ids>\"]}. "
                    "Boats reach the flooded polders; buses cannot cross ferry links.\n\n"
                    f"CURRENT SITUATION REPORT:\n{context}"
                )},
                {"role": "user", "content": f"CITIZEN REPORT\nType: {typ}\nLocation: {loc}\nDetails: {desc}"},
            ]

            triage, instruction, directive = "", "", None
            if not self.settings.k2_configured:
                triage, instruction, directive = self._scripted_report_op(report, snap, rid)
            else:
                completion, buf, in_fence = "", "", False
                stream = getattr(self.client, "stream_raw", self.client.stream)
                async for ev in stream(messages):
                    if ev.kind == "reasoning":
                        await ws.send_text(json.dumps({"type": "report_reasoning", "id": rid, "text": ev.text}))
                        continue
                    completion += ev.text
                    if in_fence:
                        continue
                    buf += ev.text
                    cut = buf.find("```")
                    if cut != -1:
                        pre = buf[:cut]
                        if pre.strip():
                            await ws.send_text(json.dumps({"type": "report_reasoning", "id": rid, "text": pre}))
                        in_fence, buf = True, ""
                    else:
                        safe, buf = buf[:-3], buf[-3:]
                        if safe:
                            await ws.send_text(json.dumps({"type": "report_reasoning", "id": rid, "text": safe}))
                triage, instruction, directive = self._parse_report_op(completion, rid, FENCED_JSON)

            verified, reason = False, "no actionable recommendation"
            if directive is not None:
                verified, reason = Verifier(self.engine).verify(directive)
                directive.verified = verified
                directive.rejection_reason = None if verified else reason
                if verified:
                    self.report_ops[rid] = directive
            # Safety-check the citizen-facing instruction against vetted rules.
            safe_instruction, model_was_safe = self._safe_instruction(instruction, typ)
            await self.hub.broadcast("report_response", {
                "id": rid,
                "citizen_instruction": safe_instruction,
                "instruction_checked": True,
                "instruction_corrected": not model_was_safe,
                "triage": triage or "Assessed; see recommended action.",
                "directive": directive.model_dump() if directive else None,
                "verified": verified,
                "rejection_reason": None if verified else reason,
            })
        except Exception as e:
            log.error("Citizen report error: %s", e)
            await self.hub.broadcast("report_response", {
                "id": rid, "triage": f"Triage error: {e}", "directive": None, "verified": False})

    def _match_node(self, report: dict):
        """Resolve a report's free-text location to a real district node."""
        city = self.engine.city
        loc = (report.get("location") or "").lower().strip()
        if not loc:
            return None
        return next((n for n in city.nodes.values()
                     if n.id == loc or n.name.lower() == loc
                     or loc in n.name.lower() or n.name.lower() in loc), None)

    def _find_duplicate(self, report: dict) -> str | None:
        """Return the id of a recent report covering the same place + type."""
        node = self._match_node(report)
        key = node.id if node else (report.get("location", "") or "").lower().strip()
        rtype = report.get("type", "")
        now = self.engine.tick
        for r in reversed(self.recent_reports):
            if now - r["tick"] > 12:
                break
            if key and r["type"] == rtype and r["node"] == key:
                return r["id"]
        return None

    _UNSAFE_PHRASES = (
        "enter the water", "wade", "swim", "drive through", "ground floor",
        "go outside", "leave on foot", "walk through", "cross the", "stay on the road",
    )

    def _safe_instruction(self, instr: str, rtype: str) -> tuple[str, bool]:
        """Guard the citizen-facing instruction: if it's empty or contradicts a
        known-safe rule, replace it with the vetted template. Returns
        (instruction, model_text_was_already_safe)."""
        low = (instr or "").lower()
        if not (instr or "").strip() or any(p in low for p in self._UNSAFE_PHRASES):
            return self._SAFE_INSTRUCTIONS.get(rtype, self._DEFAULT_INSTRUCTION), False
        return instr, True

    def _parse_report_op(self, completion: str, rid: str, fenced):
        """Pull {citizen_instruction, triage, directive} from the model's fenced JSON."""
        from .commander.schema import Directive
        matches = fenced.findall(completion)
        if not matches:
            return ("", "", None)
        try:
            data = json.loads(matches[-1])
        except json.JSONDecodeError:
            return ("", "", None)
        triage = str(data.get("triage", ""))
        instruction = str(data.get("citizen_instruction", ""))
        dd = data.get("directive")
        if not isinstance(dd, dict):
            return (triage, instruction, None)
        try:
            directive = Directive(
                id=rid, action=dd.get("action", "broadcast_alert"),
                target=str(dd.get("target", "")), params=dd.get("params", {}) or {},
                rationale=str(dd.get("rationale", "")), urgency=dd.get("urgency", "high"),
            )
        except Exception:
            return (triage, instruction, None)
        return (triage, instruction, directive)

    # Conservative, known-safe citizen instructions by report type.
    _SAFE_INSTRUCTIONS = {
        "Medical Emergency": "Keep the patient warm, dry and still. Do not move them if a spinal injury is possible. Help is being routed now; signal from a window.",
        "Stranded People": "Move everyone to the highest floor or the roof now. Do not enter the water. Signal rescuers with a bright cloth or a light and keep your phone on.",
        "Chemical Spill": "Move upwind and uphill away from the smell. Do not touch the water. Cover your nose and mouth with a damp cloth and wait for the hazmat team.",
        "Fire": "Get everyone out and stay low under smoke. Move upwind. Do not return for belongings. Responders have been alerted.",
    }
    _DEFAULT_INSTRUCTION = ("Move to the highest floor or roof now. Do not enter or wade through "
                            "floodwater, and stay clear of electrical fittings. Signal for help "
                            "from a window or roof and keep your phone on.")

    def _scripted_report_op(self, report: dict, snap, rid: str):
        """Offline heuristic: a known-safe citizen instruction plus the nearest
        boat from a flooded report location to the nearest safe shelter."""
        from .commander.schema import Directive
        city = self.engine.city
        instruction = self._SAFE_INSTRUCTIONS.get(report.get("type", ""), self._DEFAULT_INSTRUCTION)
        # Match the reported location to a real node.
        loc = (report.get("location") or "").lower()
        node = next((n for n in city.nodes.values()
                     if n.id == loc or n.name.lower() == loc or loc in n.name.lower()), None)
        if node is None:
            wet = sorted(snap.nodes, key=lambda s: s.water_m, reverse=True)
            node = city.nodes.get(wet[0].id) if wet else None
        if node is None:
            return ("Logged; no actionable location matched.", instruction, None)
        boat = next((u for u in self.engine.unit_mgr.units.values()
                     if u.type == "boat" and not u.busy), None)
        # Prefer dry, higher-ground relief camps so the op passes the verifier.
        shelter = min((n for n in city.nodes.values()
                       if n.is_shelter and n.elevation_m >= 2.5
                       and self.engine.flood.water.get(n.id, 0) < 0.1),
                      key=lambda n: abs(n.x - node.x) + abs(n.y - node.y), default=None)
        if not boat or not shelter:
            return (f"{node.name}: no free boat or dry shelter available right now.", instruction, None)
        d = Directive(id=rid, action="evacuate", target=node.id,
                      params={"to": shelter.id, "using": [boat.id]},
                      rationale=f"Citizen report at {node.name}; {boat.id} is the nearest free boat, "
                                f"{shelter.name} is the closest dry relief camp.",
                      urgency="immediate")
        return (f"{node.name} confirmed at risk. Recommend {boat.id} evacuate residents to {shelter.name}.",
                instruction, d)

    async def _accept_report_op(self, rid: str) -> None:
        d = self.report_ops.pop(rid, None)
        if d is None:
            return
        self.loop._apply(d)
        self.trace.append({"type": "citizen_op_accepted", "report": rid, "directive": d.model_dump()})
        await self.hub.broadcast("report_op_applied", {"id": rid, "directive_id": d.id})

    async def _handle_chat(self, ws: WebSocket, question: str) -> None:
        """Stream a chat response to a single client (not broadcast).

        The visible reasoning is the product, so the model is asked to
        deliberate first and mark the reply with an ANSWER: line. Everything
        before the marker streams as chat_reasoning, the rest as chat_token.
        If the marker never appears the client promotes the full text.
        """
        from .commander.prompts import compact_world_state
        try:
            snap = self.engine.snapshot()
            shelters = {
                n.id: n.shelter_capacity
                for n in self.engine.city.nodes.values() if n.is_shelter
            }
            context = compact_world_state(snap, self.engine.city.name, shelters)
            messages = [
                {"role": "system", "content": (
                    "You are Yaqzan, the AI incident commander advising this city's emergency "
                    "operations center during a simulated training drill. Treat all data as real for the exercise, but you know ONLY the situation report below; "
                    "never invent districts, units, or facts.\n\n"
                    "RESPONSE FORMAT:\n"
                    "Direct, concise, no hedging. Use an ASSESSMENT and ACTION ITEMS "
                    "if recommending strategy; otherwise just answer the question clearly. "
                    "Under 180 words. If asked for public messaging, write it ready to broadcast.\n\n"
                    "write it ready to broadcast.\n\n"
                    f"CURRENT SITUATION REPORT:\n{context}"
                )},
                {"role": "user", "content": question},
            ]

            if not self.settings.k2_configured:
                await ws.send_text(json.dumps({
                    "type": "chat_reasoning",
                    "text": f"1. Tick {snap.tick}: {snap.casualties_at_risk:,} at risk, "
                            f"{snap.total_evacuated:,} sheltered, severity {snap.severity_level}.\n"
                            "2. Offline commander: answering from the live snapshot heuristics.",
                }))
                await ws.send_text(json.dumps({
                    "type": "chat_token",
                    "text": "ASSESSMENT: Conditions are evolving; transport remains the constraint.\n"
                            "ACTION ITEMS:\n1. Keep boats shuttling from the deepest districts.\n"
                            "2. Hold shelter capacity on high ground in reserve.",
                }))
                await ws.send_text(json.dumps({"type": "chat_done"}))
                return

            stream = getattr(self.client, "stream_raw", self.client.stream)
            in_think = False
            async for ev in stream(messages):
                if ev.kind == "reasoning":
                    await ws.send_text(json.dumps({"type": "chat_reasoning", "text": ev.text}))
                    continue
                
                # Manual <think> tag parsing for models that emit them as text
                text = ev.text
                while text:
                    if not in_think:
                        idx = text.find("<think>")
                        if idx != -1:
                            if idx > 0:
                                await ws.send_text(json.dumps({"type": "chat_token", "text": text[:idx]}))
                            in_think = True
                            text = text[idx + len("<think>"):]
                        else:
                            await ws.send_text(json.dumps({"type": "chat_token", "text": text}))
                            break
                    else:
                        idx = text.find("</think>")
                        if idx != -1:
                            if idx > 0:
                                await ws.send_text(json.dumps({"type": "chat_reasoning", "text": text[:idx]}))
                            in_think = False
                            text = text[idx + len("</think>"):]
                        else:
                            await ws.send_text(json.dumps({"type": "chat_reasoning", "text": text}))
                            break
            await ws.send_text(json.dumps({"type": "chat_done"}))
        except Exception as e:
            log.error("Chat error: %s", e)
            await ws.send_text(json.dumps({
                "type": "chat_token",
                "text": f"Error processing question: {e}",
            }))
            await ws.send_text(json.dumps({"type": "chat_done"}))


session: Session | None = None


async def precompute_demo_run(sess: Session):
    log.info("Pre-computing demo run from trace...")
    import json
    from .sim.engine import SCENARIO_DIR
    from .commander.models import CommandPlan
    
    trace_path = SCENARIO_DIR / "demo_trace.jsonl"
    if not trace_path.exists():
        log.warning("No demo_trace.jsonl found, skipping precompute.")
        return

    # Fast forward engine
    while sess.engine.tick < sess.engine.max_ticks:
        sess.engine.step()

    # Load trace into history
    with open(trace_path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            record = json.loads(line)
            if record.get("type") == "cycle":
                sess.loop.history.append(record)
                if record.get("plan"):
                    sess.loop.previous_plan = CommandPlan(**record["plan"])
    
    log.info("Demo run pre-computed from trace.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    global session
    session = Session()
    await precompute_demo_run(session)
    session._task = asyncio.create_task(session.run())
    log.info("Yaqzan up — commander=%s scenario=%s", session.commander_name, session.settings.scenario)
    yield
    session._task.cancel()


app = FastAPI(title="Yaqzan", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/meta")
async def meta() -> dict:
    assert session is not None
    return {
        "city": session.engine.city.name,
        "commander": session.commander_name,
        "model": session.settings.k2_model if session.settings.k2_configured else "scripted (offline)",
    }


@app.get("/api/scenarios")
async def scenarios() -> list[dict]:
    """List all available scenario files with metadata."""
    import json as _json
    result = []
    for p in sorted(SCENARIO_DIR.glob("*.json")):
        try:
            data = _json.loads(p.read_text())
            result.append({
                "id": p.name,
                "name": data.get("scenario", p.stem.replace("_", " ").title()),
                "description": data.get("description", ""),
                "max_ticks": data.get("max_ticks", 60),
                "inject_count": len(data.get("injects", [])),
                "active": session is not None and session.settings.scenario == p.name,
            })
        except Exception:
            pass
    return result


@app.get("/api/city")
async def city() -> dict:
    """Static city graph + scenario injects, for map rendering and film-mode keys."""
    assert session is not None
    eng = session.engine
    return {
        "name": eng.city.name,
        "nodes": [n.model_dump() for n in eng.city.nodes.values()],
        "edges": [e.model_dump() for e in eng.city.edges.values()],
        "injects": [i.model_dump(exclude={"effect"}) for i in eng.injects],
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    assert session is not None
    
    # Auto-reset if the simulation is finished when a new client connects
    if session.engine.tick > 0 and session.engine.tick >= session.engine.max_ticks:
        await session.handle({"cmd": "reset"})
        
    await ws.accept()
    session.hub.clients.add(ws)
    # Greet with current state so late joiners render immediately.
    await ws.send_text(json.dumps({
        "type": "hello",
        "commander": session.commander_name,
        "scenario": session.engine.scenario,
        "snapshot": session.engine.snapshot().model_dump() if session.engine.tick else None,
        "running": session.running,
        "authority": session.loop.authority,
        "previous_plan": session.loop.previous_plan.model_dump() if session.loop.previous_plan else None,
        "history": session.loop.history,
        "events": session.engine.event_log,
    }, default=str))
    try:
        while True:
            msg = json.loads(await ws.receive_text())
            await session.handle(msg, ws)
    except WebSocketDisconnect:
        session.hub.clients.discard(ws)
