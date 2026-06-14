"""SimulationEngine: deterministic, seeded, tick-based.

Runs standalone (`python -m app.sim.engine --scenario coastal_flood.json
--ticks 60`) with no K2 dependency. Every tick produces a StateSnapshot —
the single source of truth broadcast to the frontend and compacted into
the commander's world state.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from pydantic import BaseModel, Field

from .city import CityGraph, load_scenario
from .flood import FloodModel
from .telemetry import CityTelemetry, TelemetrySynth
from .units import Unit, UnitManager

SCENARIO_DIR = Path(__file__).parent / "scenarios"


class Inject(BaseModel):
    tick: int
    id: str
    severity: str
    headline: str
    effect: dict


class NodeState(BaseModel):
    id: str
    water_m: float
    depth: str                 # dry | ponding | flooded | severe
    pop_present: int
    evacuees_waiting: int
    power: bool
    shelter_occupancy: int = 0
    contaminated: bool = False


class StateSnapshot(BaseModel):
    tick: int
    nodes: list[NodeState]
    impassable_edges: list[str]
    destroyed_edges: list[str]
    units: list[Unit]
    telemetry: CityTelemetry
    active_injects: list[Inject]
    casualties_at_risk: int
    total_evacuated: int
    alerts_broadcast: list[str] = Field(default_factory=list)
    contaminated_nodes: list[str] = Field(default_factory=list)
    severity_level: str = "normal"  # normal | elevated | critical | extreme
    # Risk in the no-commander ghost run at this tick; the gap vs
    # casualties_at_risk is the commander's measured effect.
    baseline_risk: int = 0


class SimulationEngine:
    def __init__(self, scenario_path: str | Path, seed: int | None = None,
                 with_baseline: bool = True) -> None:
        data = load_scenario(scenario_path)
        self.scenario = data
        self.seed = seed if seed is not None else data.get("seed", 0)
        self.city = CityGraph.from_scenario(data)
        self.flood = FloodModel(self.city, data["water_sources"], data["base_surge_rate_m"], self.seed)
        self.telemetry = TelemetrySynth(self.city, self.seed)
        self.unit_mgr = UnitManager(self.city, [Unit(**u) for u in data["units"]])
        self.injects = [Inject(**i) for i in data["injects"]]
        self.rainfall = data["rainfall_curve"]
        self.max_ticks: int = data.get("ticks", 60)

        self.tick = 0
        self.destroyed_edges: set[str] = set()
        # People who have left buildings and are awaiting transport, per node.
        self.evacuees: dict[str, int] = {}
        # People physically lifted out of each node (reduces presence there).
        self.evacuated_from: dict[str, int] = {}
        self.shelter_load: dict[str, int] = {}
        self.closed_routes: set[str] = set()
        self.alerts: list[str] = []
        # Districts under official alert: residents move to upper floors /
        # assembly points, cutting their flood exposure. The benefit RAMPS in
        # over a few ticks (people take time to react to a warning), so we record
        # WHEN each alert was issued, not just whether it was.
        self.alerted_nodes: set[str] = set()
        self.alerted_at: dict[str, int] = {}
        self.citywide_alert = False
        self.citywide_alert_tick: int | None = None
        self.active_injects: list[Inject] = []
        self.event_log: list[str] = []
        # Chemical/industrial contamination — nodes unsafe for civilians.
        self.contaminated_nodes: set[str] = set()
        # Forced power outages (from inject, separate from flood-based outages).
        self.forced_outages: set[str] = set()

        # Counterfactual baseline: the same disaster with no commander at all.
        # Deterministic (same seed), so the gap between this curve and the live
        # run is exactly the measured effect of the commander's decisions.
        self.baseline_risk: list[int] = []
        if with_baseline:
            ghost = SimulationEngine(scenario_path, seed=self.seed, with_baseline=False)
            for _ in range(ghost.max_ticks):
                ghost.step()
                self.baseline_risk.append(ghost.casualties_at_risk())

    # ---- directive-driven mutations (called by commander loop after Accept) ----

    def order_evacuation(self, node_id: str, fraction: float = 0.35) -> int:
        """Civilians in `node_id` muster for transport. Returns count mobilized."""
        node = self.city.nodes[node_id]
        remaining = node.population - self.evacuated_from.get(node_id, 0)
        already = self.evacuees.get(node_id, 0)
        mobilized = max(0, int(remaining * fraction) - already)
        if mobilized > 0:
            self.evacuees[node_id] = already + mobilized
        return mobilized

    def close_route(self, edge_id: str) -> None:
        self.closed_routes.add(edge_id)

    def broadcast_alert(self, message: str, target: str = "citywide") -> None:
        self.alerts.append(message)
        if target == "citywide":
            if not self.citywide_alert:
                self.citywide_alert_tick = self.tick
            self.citywide_alert = True
        elif target in self.city.nodes:
            if target not in self.alerted_nodes:
                self.alerted_at[target] = self.tick
            self.alerted_nodes.add(target)
        if "heritage" in message.lower() and self.telemetry.rumor_active:
            self.telemetry.rumor_active = False  # counter-messaging kills the rumor
            self.event_log.append("Counter-broadcast issued — Heritage Square rumor traffic collapsing")

    # ---- tick loop ----

    def impassable_edges(self) -> set[str]:
        out = set(self.destroyed_edges) | set(self.closed_routes)
        for eid in self.city.edges:
            if eid not in out and self.flood.edge_impassable(eid):
                out.add(eid)
        return out

    def apply_inject(self, inj: Inject) -> None:
        eff = inj.effect
        if "surge_rate_m" in eff:
            self.flood.surge_rate_m = eff["surge_rate_m"]
        if "water_spike" in eff:
            self.flood.spike(eff["water_spike"])
        if "destroy_edge" in eff:
            self.destroyed_edges.add(eff["destroy_edge"])
        if "hospital_generator_down" in eff:
            self.telemetry.generator_down.add(eff["hospital_generator_down"])
        if "crowd_surge" in eff:
            cs = eff["crowd_surge"]
            self.telemetry.rumor_active = True
            self.evacuees[cs["target"]] = self.evacuees.get(cs["target"], 0) + cs["people"]
        # New inject effects:
        if "power_outage" in eff:
            for nid in eff["power_outage"]:
                self.forced_outages.add(nid)
            self.event_log.append(f"[t{self.tick}] Cascading power failure: {', '.join(eff['power_outage'])}")
        if "cell_degradation" in eff:
            self.telemetry.cell_cap_override = eff["cell_degradation"]
            self.event_log.append(f"[t{self.tick}] Cell network degraded to {eff['cell_degradation']}%")
        if "add_water_source" in eff:
            self.flood.sources.add(eff["add_water_source"])
            self.event_log.append(f"[t{self.tick}] New water ingress point: {eff['add_water_source']}")
        if "contaminate" in eff:
            for nid in eff["contaminate"]:
                self.contaminated_nodes.add(nid)
            self.event_log.append(f"[t{self.tick}] HAZMAT: contamination at {', '.join(eff['contaminate'])}")
        self.active_injects.append(inj)
        self.event_log.append(f"[t{self.tick}] {inj.headline}")

    def step(self) -> StateSnapshot:
        self.tick += 1
        rainfall = self.rainfall[min(self.tick - 1, len(self.rainfall) - 1)]
        self.flood.step(rainfall)

        fired = [i for i in self.injects if i.tick == self.tick]
        for inj in fired:
            self.apply_inject(inj)

        impassable = self.impassable_edges()
        events = self.unit_mgr.step(impassable, self.evacuees, self.shelter_load, self.evacuated_from)
        self.event_log.extend(f"[t{self.tick}] {e}" for e in events)

        return self.snapshot()

    def casualties_at_risk(self) -> int:
        risk = 0
        for nid, node in self.city.nodes.items():
            w = self.flood.water[nid]
            if w <= 0.1:
                continue
            exposure = min(1.0, w / 1.5)
            # Warning benefit ramps in over ~6 ticks as residents actually move
            # to upper floors / staging — a single broadcast does not instantly
            # halve risk, so the exposure reduction is earned across the run.
            ramp_ticks = 6.0
            if nid in self.alerted_at:
                r = min(1.0, max(0.0, (self.tick - self.alerted_at[nid]) / ramp_ticks))
                exposure *= 1.0 - 0.5 * r
            elif self.citywide_alert_tick is not None:
                r = min(1.0, max(0.0, (self.tick - self.citywide_alert_tick) / ramp_ticks))
                exposure *= 1.0 - 0.2 * r
            # Contaminated zones amplify risk — chemical exposure on top of drowning.
            if nid in self.contaminated_nodes:
                exposure = min(1.0, exposure * 1.5)
            present = max(0, node.population - self.evacuated_from.get(nid, 0))
            risk += int(present * exposure * 0.3)
        return risk

    def severity_level(self) -> str:
        """Overall crisis severity for UI display."""
        risk = self.casualties_at_risk()
        critical_injects = sum(1 for i in self.active_injects if i.severity == "critical")
        has_contamination = len(self.contaminated_nodes) > 0
        if risk > 15000 or critical_injects >= 3 or has_contamination:
            return "extreme"
        if risk > 8000 or critical_injects >= 2:
            return "critical"
        if risk > 3000 or critical_injects >= 1:
            return "elevated"
        return "normal"

    def snapshot(self) -> StateSnapshot:
        impassable = self.impassable_edges()
        idx = min(self.tick - 1, len(self.rainfall) - 1)
        tel = self.telemetry.synthesize(
            self.tick, self.flood, self.rainfall[idx],
            forecast_rain=[float(v) for v in self.rainfall[idx + 1 : idx + 7]],
            forced_outages=self.forced_outages,
            contaminated=self.contaminated_nodes,
        )
        nodes = [
            NodeState(
                id=nid,
                water_m=round(self.flood.water[nid], 2),
                depth=self.flood.depth_category(nid),
                pop_present=max(0, n.population - self.evacuated_from.get(nid, 0)),
                evacuees_waiting=self.evacuees.get(nid, 0),
                power=nid not in tel.power_outage_nodes,
                shelter_occupancy=self.shelter_load.get(nid, 0),
                contaminated=nid in self.contaminated_nodes,
            )
            for nid, n in self.city.nodes.items()
        ]
        return StateSnapshot(
            tick=self.tick,
            nodes=nodes,
            impassable_edges=sorted(impassable),
            destroyed_edges=sorted(self.destroyed_edges),
            units=list(self.unit_mgr.units.values()),
            telemetry=tel,
            active_injects=self.active_injects[-6:],
            casualties_at_risk=self.casualties_at_risk(),
            total_evacuated=sum(self.shelter_load.values()),
            alerts_broadcast=self.alerts[-3:],
            contaminated_nodes=sorted(self.contaminated_nodes),
            severity_level=self.severity_level(),
            baseline_risk=(
                self.baseline_risk[min(self.tick - 1, len(self.baseline_risk) - 1)]
                if self.baseline_risk and self.tick > 0 else 0
            ),
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Yaqzan sim standalone.")
    parser.add_argument("--scenario", default="kuttanad_monsoon.json")
    parser.add_argument("--ticks", type=int, default=60)
    parser.add_argument("--seed", type=int, default=None)
    args = parser.parse_args()

    engine = SimulationEngine(SCENARIO_DIR / args.scenario, seed=args.seed)
    print(f"== {engine.city.name} — {engine.scenario['description']}")
    for _ in range(args.ticks):
        snap = engine.step()
        flooded = [n.id for n in snap.nodes if n.depth in ("flooded", "severe")]
        contam = [n for n in snap.contaminated_nodes]
        line = (
            f"t{snap.tick:>3} | tide {snap.telemetry.tide_gauge_m:>5.2f}m"
            f" | rain {snap.telemetry.rainfall_mm_hr:>4.0f}mm/h"
            f" | 911 {snap.telemetry.calls_911_per_min:>4}/min"
            f" | flooded {len(flooded):>2}"
            f" | blocked edges {len(snap.impassable_edges):>2}"
            f" | at-risk {snap.casualties_at_risk:>6,}"
            f" | [{snap.severity_level.upper():>8}]"
        )
        print(line)
        for inj in (i for i in engine.injects if i.tick == snap.tick):
            print(f"      >> INJECT: {inj.headline}")
        if contam:
            print(f"      ⚠ HAZMAT: {', '.join(contam)}")
    print("\n-- event log tail --")
    for e in engine.event_log[-12:]:
        print("  " + e)


if __name__ == "__main__":
    main()
