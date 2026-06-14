import asyncio
import json

import pytest

from app.commander.k2_client import StreamEvent, _split_think
from app.commander.loop import CommanderLoop
from app.commander.schema import extract_plan
from app.commander.scripted import ScriptedCommander
from app.commander.verifier import Verifier
from app.sim.engine import SCENARIO_DIR, SimulationEngine
from app.trace.store import TraceStore

SCENARIO = SCENARIO_DIR / "kuttanad_monsoon.json"

VALID_PLAN = {
    "cycle": 1,
    "situation_read": "Kuttanad polders flooding as the Pamba crests.",
    "directives": [
        {"id": "d1", "action": "evacuate", "target": "champakulam",
         "params": {"to": "changanassery", "using": ["boat_3"]},
         "rationale": "Deepest water, largest population.", "urgency": "immediate"}
    ],
    "watching": ["Pamba gauge"],
    "confidence": "medium",
}


def test_extract_plan_from_fenced_block():
    text = "Step 1: assess.\n```json\n" + json.dumps(VALID_PLAN) + "\n```"
    plan = extract_plan(text, 1)
    assert plan.directives[0].target == "champakulam"


def test_extract_plan_takes_last_block_and_handles_bare_json():
    two = "```json\n{}\n```\ntext\n```json\n" + json.dumps(VALID_PLAN) + "\n```"
    assert extract_plan(two, 1).confidence == "medium"
    bare = "reasoning then " + json.dumps(VALID_PLAN)
    assert extract_plan(bare, 1).cycle == 1


def test_extract_plan_malformed_raises_readable_error():
    with pytest.raises(ValueError, match="JSON syntax error"):
        extract_plan("```json\n{not json}\n```", 1)
    bad = dict(VALID_PLAN, confidence="certain")
    with pytest.raises(ValueError, match="Schema validation failed"):
        extract_plan("```json\n" + json.dumps(bad) + "\n```", 1)


def test_split_think_inline_tags():
    events = _split_think("<think>I reason</think>answer", False)
    assert ("reasoning", "I reason") in events
    assert ("content", "answer") in events


# ---- verifier rules: each rule has a failing case ----

@pytest.fixture
def engine():
    eng = SimulationEngine(SCENARIO, seed=1414)
    for _ in range(12):  # flood the coast
        eng.step()
    return eng


def _directive(**kw):
    from app.commander.schema import Directive
    base = dict(id="d1", action="evacuate", target="champakulam",
                params={"to": "changanassery", "using": ["boat_1"]},
                rationale="r", urgency="high")
    base.update(kw)
    return Directive(**base)


def test_verifier_accepts_valid_evacuation(engine):
    ok, _ = Verifier(engine).verify(_directive())
    assert ok


def test_verifier_rejects_unknown_node(engine):
    ok, reason = Verifier(engine).verify(_directive(target="atlantis"))
    assert not ok and "unknown node" in reason


def test_verifier_rejects_nonshelter_destination(engine):
    ok, reason = Verifier(engine).verify(_directive(params={"to": "alappuzha_town", "using": ["boat_1"]}))
    assert not ok and "not a shelter" in reason


def test_verifier_rejects_flooded_shelter(engine):
    engine.flood.water["edathua"] = 2.0
    ok, reason = Verifier(engine).verify(_directive(params={"to": "edathua", "using": ["boat_1"]}))
    assert not ok and "taking water" in reason


def test_verifier_rejects_full_shelter(engine):
    engine.shelter_load["changanassery"] = 99000
    ok, reason = Verifier(engine).verify(_directive())
    assert not ok and "at capacity" in reason


def test_verifier_rejects_unknown_unit(engine):
    ok, reason = Verifier(engine).verify(_directive(params={"to": "changanassery", "using": ["bus_99"]}))
    assert not ok and "unknown unit" in reason


def test_verifier_rejects_unreachable_route_for_road_unit(engine):
    # bus on high ground, target deep in a flooded polder => no passable road
    for _ in range(10):
        engine.step()
    d = _directive(target="kainakary", params={"to": "changanassery", "using": ["bus_1"]})
    ok, reason = Verifier(engine).verify(d)
    assert not ok and "no passable route" in reason


def test_verifier_rejects_alert_without_message(engine):
    d = _directive(action="broadcast_alert", target="citywide", params={})
    ok, reason = Verifier(engine).verify(d)
    assert not ok and "no message" in reason


# ---- closed loop with scripted commander ----

@pytest.mark.asyncio
async def test_full_cycle_end_to_end(tmp_path):
    eng = SimulationEngine(SCENARIO, seed=1414)
    for _ in range(12):
        eng.step()
    events: list[tuple[str, dict]] = []

    async def emit(t, p):
        events.append((t, p))

    loop = CommanderLoop(eng, ScriptedCommander(token_delay_s=0), TraceStore(str(tmp_path)), emit)
    await loop.run_cycle(eng.snapshot())

    types = [t for t, _ in events]
    assert "cycle_start" in types and "reasoning_token" in types and "plan" in types
    assert loop.previous_plan is not None
    assert loop.previous_plan.directives, "scripted commander should issue directives"
    # Trace persisted
    assert loop.trace.path.exists() and loop.trace.path.read_text().strip()


class FailingThenRepairedClient:
    """First call returns malformed JSON; repair call returns a valid plan."""
    def __init__(self):
        self.calls = 0

    async def stream(self, messages):
        self.calls += 1
        if self.calls == 1:
            yield StreamEvent("reasoning", "thinking...")
            yield StreamEvent("content", "```json\n{broken\n```")
        else:
            assert "failed validation" in messages[-1]["content"]
            yield StreamEvent("content", "```json\n" + json.dumps(VALID_PLAN) + "\n```")


@pytest.mark.asyncio
async def test_repair_roundtrip(tmp_path):
    eng = SimulationEngine(SCENARIO, seed=1414)
    for _ in range(12):
        eng.step()

    async def emit(t, p):
        pass

    client = FailingThenRepairedClient()
    loop = CommanderLoop(eng, client, TraceStore(str(tmp_path)), emit)
    await loop.run_cycle(eng.snapshot())
    assert client.calls == 2
    assert loop.previous_plan is not None


@pytest.mark.asyncio
async def test_supervised_authority_holds_until_operator_accepts(tmp_path):
    eng = SimulationEngine(SCENARIO, seed=1414)
    for _ in range(6):
        eng.step()
    events: list[tuple[str, dict]] = []

    async def emit(t, p):
        events.append((t, p))

    loop = CommanderLoop(eng, ScriptedCommander(token_delay_s=0), TraceStore(str(tmp_path)), emit)
    assert loop.authority == "supervised"
    await loop.run_cycle(eng.snapshot())
    assert loop.pending, "supervised mode must hold verified directives"
    assert not any(u.busy for u in eng.unit_mgr.units.values()), "nothing executes before approval"

    keys = sorted(loop.pending)
    c, d = keys[0].split(":")
    assert await loop.accept(int(c), d)
    if len(keys) > 1:
        c2, d2 = keys[1].split(":")
        loop.override(int(c2), d2)
        assert keys[1] not in loop.pending
    await loop.accept_all(loop.cycle)
    assert not loop.pending
    assert any(t == "directives_applied" for t, _ in events)

    # Delegated mode auto-applies on the next cycle.
    loop.authority = "delegated"
    for _ in range(3):
        eng.step()
    await loop.run_cycle(eng.snapshot())
    assert not loop.pending
