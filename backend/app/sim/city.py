"""City graph model.

The city is a hand-crafted graph loaded from a JSON scenario file.
Nodes are districts; edges are roads. Everything the commander reasons
about is grounded in this structure — the closed-world rule depends on it.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator

from pydantic import BaseModel, Field


class Node(BaseModel):
    id: str
    name: str
    x: float
    y: float
    elevation_m: float
    population: int
    is_shelter: bool = False
    shelter_capacity: int = 0
    is_hospital: bool = False
    is_pump_station: bool = False
    # Real-world grounding (OpenStreetMap / OpenDataKerala, ODbL). lat/lon are
    # genuine; `osm` holds counts of real facilities snapped to this district
    # and the names of flagship ones, so every shelter/hospital is verifiable.
    lat: float | None = None
    lon: float | None = None
    osm: dict = Field(default_factory=dict)


class Edge(BaseModel):
    id: str
    a: str
    b: str
    capacity_per_tick: int = 200
    travel_ticks: int = 1
    flooded_threshold_m: float = 0.6
    name: str = ""
    # Real OSM/OSRM grounding. mode "road" = real driving link (OSRM route);
    # "ferry" = no road across the backwaters, boat-only. distance_km and
    # duration_min are the real road values; travel_ticks derives from them.
    mode: str = "road"
    distance_km: float | None = None
    duration_min: float | None = None


class CityGraph(BaseModel):
    name: str
    nodes: dict[str, Node] = Field(default_factory=dict)
    edges: dict[str, Edge] = Field(default_factory=dict)

    @classmethod
    def from_scenario(cls, data: dict) -> "CityGraph":
        nodes = {n["id"]: Node(**n) for n in data["nodes"]}
        edges = {e["id"]: Edge(**e) for e in data["edges"]}
        for e in edges.values():
            if e.a not in nodes or e.b not in nodes:
                raise ValueError(f"edge {e.id} references unknown node")
        return cls(name=data["city_name"], nodes=nodes, edges=edges)

    def neighbors(self, node_id: str) -> Iterator[tuple[str, Edge]]:
        for e in self.edges.values():
            if e.a == node_id:
                yield e.b, e
            elif e.b == node_id:
                yield e.a, e

    def shortest_path(
        self, src: str, dst: str, blocked_edges: set[str] | None = None
    ) -> list[str] | None:
        """BFS path (node ids incl. src and dst) avoiding blocked edges."""
        blocked = blocked_edges or set()
        if src == dst:
            return [src]
        frontier = [src]
        came_from: dict[str, str] = {src: src}
        while frontier:
            nxt: list[str] = []
            for cur in frontier:
                for nb, edge in self.neighbors(cur):
                    if edge.id in blocked or nb in came_from:
                        continue
                    came_from[nb] = cur
                    if nb == dst:
                        path = [dst]
                        while path[-1] != src:
                            path.append(came_from[path[-1]])
                        return list(reversed(path))
                    nxt.append(nb)
            frontier = nxt
        return None


def load_scenario(path: str | Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
