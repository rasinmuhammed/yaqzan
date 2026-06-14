import json

import pytest

from app.commander import scenario_gen as sg
from app.sim.engine import SCENARIO_DIR, SimulationEngine

BASE = SCENARIO_DIR / "kuttanad_monsoon.json"


@pytest.fixture
def city():
    return SimulationEngine(BASE, seed=1, with_baseline=False).city


def test_scripted_fallback_is_valid_and_deterministic(city):
    a = sg.scripted_fallback("category 5 cyclone at night", city)
    b = sg.scripted_fallback("category 5 cyclone at night", city)
    assert a == b
    assert sg.validate_against_city(a, city) == []


def test_validator_rejects_unknown_ids_and_bad_effects(city):
    gen = sg.scripted_fallback("storm", city)
    gen.water_sources = ["atlantis"]
    gen.injects[0].effect = {"destroy_edge": "e_nope", "made_up_effect": 1}
    gen.injects[1].tick = 999
    errors = sg.validate_against_city(gen, city)
    text = " ".join(errors)
    assert "atlantis" in text and "e_nope" in text and "made_up_effect" in text and "999" in text


def test_validator_rejects_high_ground_water_source(city):
    gen = sg.scripted_fallback("storm", city)
    gen.water_sources = ["thiruvalla"]  # elevation 8 m, not coastal
    assert any("high ground" in e for e in sg.validate_against_city(gen, city))


def test_parse_generated_reads_fenced_block(city):
    gen = sg.scripted_fallback("flood", city)
    text = "I will design a flood.\n```json\n" + json.dumps(gen.model_dump()) + "\n```"
    parsed = sg.parse_generated(text)
    assert parsed.name == gen.name
    with pytest.raises(ValueError, match="fenced"):
        sg.parse_generated("no json here")


def test_interpolate_curve_spans_full_run():
    curve = sg.interpolate_curve([0, 10, 50, 10, 0], 60)
    assert len(curve) == 60
    assert curve[0] == 0 and curve[-1] == 0
    assert 48 <= max(curve) <= 50  # peak may fall between samples


def test_assembled_scenario_runs_in_engine(tmp_path, city):
    gen = sg.scripted_fallback("harbor wall breach during festival", city)
    base = json.loads(BASE.read_text())
    scenario = sg.assemble_scenario(gen, base, "harbor wall breach during festival")
    fname = sg.save_generated(scenario, tmp_path)
    eng = SimulationEngine(tmp_path / fname, with_baseline=False)
    for _ in range(eng.max_ticks):
        eng.step()
    assert eng.tick == gen.ticks
    assert any("Hospital backup power failing" in e for e in eng.event_log)
