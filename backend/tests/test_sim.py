from app.sim.engine import SCENARIO_DIR, SimulationEngine

SCENARIO = SCENARIO_DIR / "kuttanad_monsoon.json"


def run(ticks: int, seed: int = 2018) -> SimulationEngine:
    eng = SimulationEngine(SCENARIO, seed=seed, with_baseline=False)
    for _ in range(ticks):
        eng.step()
    return eng


def test_determinism_same_seed_identical_run():
    a, b = run(30), run(30)
    assert a.flood.water == b.flood.water
    assert a.snapshot().model_dump() == b.snapshot().model_dump()


def test_different_seed_diverges():
    a, b = run(30, seed=1), run(30, seed=2)
    assert a.flood.water != b.flood.water


def test_flood_rises_at_sources_and_propagates():
    eng = run(14)
    # A below-sea-level source polder takes water.
    assert eng.flood.water["kainakary"] > 0.5
    # Water reaches a non-source polder neighbour.
    assert eng.flood.water["champakulam"] > 0.1
    # High ground (Thiruvalla, ~8 m) stays dry-ish.
    assert eng.flood.water["thiruvalla"] < 0.3


def test_injects_fire_and_destroy_edge():
    eng = run(15)  # pandanad bridge inject fires at t14
    assert "e_changanassery_pandanad" in eng.destroyed_edges
    assert "e_changanassery_pandanad" in eng.impassable_edges()


def test_unit_moves_and_delivers():
    eng = SimulationEngine(SCENARIO, seed=2018, with_baseline=False)
    eng.order_evacuation("champakulam")
    eng.unit_mgr.assign("boat_3", "champakulam", "edathua", shuttle=True)
    for _ in range(20):
        eng.step()
    assert eng.shelter_load.get("edathua", 0) > 0


def test_boat_ignores_flooded_edges():
    eng = run(22)  # by t22 the polders are heavily flooded
    boat = eng.unit_mgr.units["boat_1"]
    blocked = eng.unit_mgr.blocked_edges(boat, eng.impassable_edges())
    assert blocked == set()
    bus = eng.unit_mgr.units["bus_1"]
    assert eng.unit_mgr.blocked_edges(bus, eng.impassable_edges())
