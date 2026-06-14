"""Feasibility verification of every directive against ground-truth state.

The commander's output is advisory; the verifier is the safety layer
that grounds it. Every directive gets verified=True or a human-readable
rejection reason — rejections are displayed (red badge), not hidden,
and are fed back into the next cycle's prompt.
"""
from __future__ import annotations

from ..sim.engine import SimulationEngine
from .schema import CommandPlan, Directive

# A node is unsafe to receive civilians when standing water exceeds
# this fraction of its elevation (spec rule) or an absolute depth.
UNSAFE_WATER_FRACTION = 0.5
UNSAFE_WATER_ABS_M = 0.45


class Verifier:
    def __init__(self, engine: SimulationEngine) -> None:
        self.engine = engine

    def verify_plan(self, plan: CommandPlan) -> list[str]:
        """Mutates directives in place; returns rejection summaries for next-cycle feedback."""
        feedback: list[str] = []
        for d in plan.directives:
            ok, reason = self.verify(d)
            d.verified = ok
            d.rejection_reason = None if ok else reason
            if not ok:
                feedback.append(f"{d.id} ({d.action} {d.target}): {reason}")
        return feedback

    def verify(self, d: Directive) -> tuple[bool, str]:
        eng = self.engine
        city = eng.city
        try:
            if d.action == "evacuate":
                if d.target not in city.nodes:
                    return False, f"unknown node '{d.target}'"
                dest = d.params.get("to")
                if dest not in city.nodes:
                    return False, f"destination '{dest}' does not exist"
                if not city.nodes[dest].is_shelter:
                    return False, f"'{dest}' is not a shelter"
                if self._node_unsafe(dest):
                    return False, (
                        f"shelter '{dest}' is taking water "
                        f"({eng.flood.water[dest]:.2f}m) — civilians must not be moved into it"
                    )
                # Contamination check: cannot send civilians into a contaminated zone.
                if dest in eng.contaminated_nodes:
                    return False, (
                        f"shelter '{dest}' is in a contaminated zone — "
                        f"HAZMAT risk, civilians must not be directed there"
                    )
                if d.target in eng.contaminated_nodes:
                    # We allow evacuation FROM contaminated zones (rescue), but warn.
                    pass
                remaining = city.nodes[dest].shelter_capacity - eng.shelter_load.get(dest, 0)
                if remaining <= 0:
                    return False, f"shelter '{dest}' is at capacity"
                bad_units = [u for u in d.params.get("using", []) if u not in eng.unit_mgr.units]
                if bad_units:
                    return False, f"unknown unit(s): {', '.join(bad_units)}"
                for uid in d.params.get("using", []):
                    unit = eng.unit_mgr.units[uid]
                    blocked = (eng.impassable_edges() | eng.unit_mgr.ferry_edges) if unit.type != "boat" else set()
                    if city.shortest_path(unit.location, d.target, blocked) is None:
                        return False, f"unit '{uid}' has no passable route to '{d.target}'"
                return True, ""

            if d.action == "move_unit" or d.action == "stage_resource":
                uid = d.target
                if uid not in eng.unit_mgr.units:
                    return False, f"unknown unit '{uid}'"
                dest = d.params.get("to") or d.params.get("at")
                if dest not in city.nodes:
                    return False, f"destination '{dest}' does not exist"
                # Cannot stage resources in contaminated zones.
                if dest in eng.contaminated_nodes:
                    return False, f"destination '{dest}' is contaminated — unsafe for staging"
                unit = eng.unit_mgr.units[uid]
                blocked = (eng.impassable_edges() | eng.unit_mgr.ferry_edges) if unit.type != "boat" else set()
                if city.shortest_path(unit.location, dest, blocked) is None:
                    return False, f"no passable route from '{unit.location}' to '{dest}'"
                return True, ""

            if d.action == "open_shelter":
                if d.target not in city.nodes:
                    return False, f"unknown node '{d.target}'"
                if not city.nodes[d.target].is_shelter:
                    return False, f"'{d.target}' has no shelter capability"
                if self._node_unsafe(d.target):
                    return False, f"shelter '{d.target}' is flooding — cannot open"
                if d.target in eng.contaminated_nodes:
                    return False, f"shelter '{d.target}' is in a contaminated zone — cannot open"
                return True, ""

            if d.action == "close_route":
                if d.target not in city.edges:
                    return False, f"unknown edge '{d.target}'"
                return True, ""

            if d.action == "broadcast_alert":
                if d.target != "citywide" and d.target not in city.nodes:
                    return False, f"unknown broadcast target '{d.target}'"
                if not d.params.get("message"):
                    return False, "alert has no message text"
                return True, ""

            if d.action == "medical_priority":
                if d.target not in city.nodes or not city.nodes[d.target].is_hospital:
                    return False, f"'{d.target}' is not a hospital"
                bad = [u for u in d.params.get("using", []) if u not in eng.unit_mgr.units]
                if bad:
                    return False, f"unknown unit(s): {', '.join(bad)}"
                return True, ""

            return False, f"unknown action '{d.action}'"
        except Exception as e:  # verifier must never crash the loop
            return False, f"verifier error: {e}"

    def _node_unsafe(self, node_id: str) -> bool:
        node = self.engine.city.nodes[node_id]
        w = self.engine.flood.water[node_id]
        return w > UNSAFE_WATER_ABS_M or w > UNSAFE_WATER_FRACTION * max(node.elevation_m, 0.1)
