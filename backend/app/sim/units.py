"""Response units and engine-resolved movement.

K2 issues directives ("move bus_3 to mangrove_quarter, evacuate to
university_city"); the engine owns pathfinding and physics. Units glide
edge-by-edge, load civilians, and deliver them to shelters. Boats ignore
flooded edges — that asymmetry is what makes boat tasking interesting
for the commander.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .city import CityGraph

UnitType = Literal["bus", "boat", "ambulance", "rescue_team"]
UnitStatus = Literal["idle", "moving", "loading", "unloading", "blocked"]


class Unit(BaseModel):
    id: str
    type: UnitType
    location: str
    capacity: int
    speed: int = 1
    status: UnitStatus = "idle"
    passengers: int = 0
    # Mission: travel to pickup, load, travel to dropoff, unload. Repeat
    # while pickup still has evacuees if shuttle=True.
    pickup: str | None = None
    dropoff: str | None = None
    path: list[str] = Field(default_factory=list)
    shuttle: bool = False
    progress: float = 0.0  # 0..1 along current edge, for smooth frontend animation
    current_edge: str | None = None  # edge the unit is traversing (for road animation)

    @property
    def busy(self) -> bool:
        return self.status != "idle"


class UnitManager:
    def __init__(self, city: CityGraph, units: list[Unit]) -> None:
        self.city = city
        self.units: dict[str, Unit] = {u.id: u for u in units}
        # Ferry edges have no road across the backwaters: only boats use them.
        self.ferry_edges: set[str] = {
            e.id for e in city.edges.values() if getattr(e, "mode", "road") == "ferry"
        }
        # Edge lookup by node pair, for resolving the segment a unit is on.
        self._edge_by_pair: dict[frozenset[str], object] = {
            frozenset((e.a, e.b)): e for e in city.edges.values()
        }

    def _seg(self, a: str, b: str):
        """The Edge object joining a and b (or None)."""
        return self._edge_by_pair.get(frozenset((a, b)))

    def assign(self, unit_id: str, pickup: str, dropoff: str | None, shuttle: bool = False) -> bool:
        """Send a unit to `pickup`; if `dropoff` set, it evacuates people there."""
        u = self.units[unit_id]
        u.pickup, u.dropoff, u.shuttle = pickup, dropoff, shuttle
        u.path = []
        u.status = "moving"
        return True

    def blocked_edges(self, unit: Unit, impassable: set[str]) -> set[str]:
        # Boats ignore flooding and use the ferry crossings; ground units are
        # stopped by flooded roads and cannot cross water-only (ferry) links.
        if unit.type == "boat":
            return set()
        return impassable | self.ferry_edges

    def step(
        self,
        impassable: set[str],
        evacuees: dict[str, int],
        shelter_load: dict[str, int],
        loaded_from: dict[str, int] | None = None,
    ) -> list[str]:
        """Advance all units one tick. Mutates evacuees/shelter_load. Returns event strings."""
        events: list[str] = []
        for u in self.units.values():
            if u.status == "idle":
                continue
            target = u.pickup if u.passengers == 0 else u.dropoff
            if target is None or (u.location == target and u.passengers == 0 and u.dropoff is None):
                u.status, u.pickup, u.path = "idle", None, []
                continue

            if u.location == target:
                if u.passengers == 0:  # arrived at pickup -> load
                    avail = evacuees.get(u.location, 0)
                    take = min(u.capacity, avail)
                    if take > 0:
                        evacuees[u.location] = avail - take
                        if loaded_from is not None:
                            loaded_from[u.location] = loaded_from.get(u.location, 0) + take
                        u.passengers = take
                        u.status = "loading"
                        events.append(f"{u.id} loaded {take} evacuees at {u.location}")
                    elif not u.shuttle:
                        u.status, u.pickup, u.dropoff = "idle", None, None
                else:  # arrived at dropoff -> unload
                    shelter_load[u.location] = shelter_load.get(u.location, 0) + u.passengers
                    events.append(f"{u.id} delivered {u.passengers} to {u.location}")
                    u.passengers = 0
                    if u.shuttle and u.pickup and evacuees.get(u.pickup, 0) > 0:
                        u.status = "moving"  # go back for more
                    else:
                        u.status, u.pickup, u.dropoff, u.shuttle = "idle", None, None, False
                u.path = []
                if u.status == "loading":
                    u.status = "moving"
                continue

            # Travel: (re)compute path if missing or newly blocked.
            blocked = self.blocked_edges(u, impassable)
            if not u.path or not self._path_clear([u.location, *u.path], blocked):
                path = self.city.shortest_path(u.location, target, blocked)
                if path is None:
                    if u.status != "blocked":
                        events.append(f"{u.id} BLOCKED — no passable route {u.location} → {target}")
                    u.status = "blocked"
                    u.current_edge = None
                    continue
                u.path = path[1:]
                u.progress = 0.0
                u.status = "moving"

            # Advance along the current real road/ferry segment at its true
            # travel time (from OSRM). Long roads and ferries take many ticks;
            # progress drives smooth movement along the real road geometry.
            if u.path:
                edge = self._seg(u.location, u.path[0])
                u.current_edge = edge.id if edge else None
                tt = max(1, getattr(edge, "travel_ticks", 1) if edge else 1)
                u.progress += u.speed / tt
                while u.progress >= 1.0 and u.path:
                    u.location = u.path.pop(0)
                    u.progress -= 1.0
                    if u.path:
                        nxt_edge = self._seg(u.location, u.path[0])
                        u.current_edge = nxt_edge.id if nxt_edge else None
                        tt = max(1, getattr(nxt_edge, "travel_ticks", 1) if nxt_edge else 1)
                if not u.path:
                    u.progress = 0.0
                    u.current_edge = None
        return events

    def _path_clear(self, path: list[str], blocked: set[str]) -> bool:
        prev = None
        for nid in path:
            if prev is not None:
                edge = self._edge_between(prev, nid)
                if edge is None or edge in blocked:
                    return False
            prev = nid
        return True

    def _edge_between(self, a: str, b: str) -> str | None:
        for e in self.city.edges.values():
            if {e.a, e.b} == {a, b}:
                return e.id
        return None
