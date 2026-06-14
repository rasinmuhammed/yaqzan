"""Deterministic flood propagation.

Not hydrology — plausibility + reproducibility. Water enters at source
nodes (coast), rises by the scenario surge rate, and flows downhill to
neighbors proportional to hydraulic-head difference. Seeded noise adds
texture without breaking determinism.
"""
from __future__ import annotations

import random

from .city import CityGraph

FLOW_K = 0.28          # fraction of head difference transferred per tick (increased for drama)
RAIN_FACTOR = 0.0014   # mm/hr rainfall -> meters of standing water per tick
DRAIN_RATE = 0.013     # passive drainage per tick on non-source nodes


class FloodModel:
    def __init__(self, city: CityGraph, sources: list[str], surge_rate_m: float, seed: int) -> None:
        self.city = city
        self.sources = set(sources)
        self.surge_rate_m = surge_rate_m
        self.rng = random.Random(seed)
        self.water: dict[str, float] = {nid: 0.0 for nid in city.nodes}

    def head(self, node_id: str) -> float:
        return self.city.nodes[node_id].elevation_m + self.water[node_id]

    def step(self, rainfall_mm_hr: float) -> None:
        # 1. Surge at sources (never below zero water).
        for nid in self.sources:
            noise = self.rng.uniform(-0.015, 0.015)
            self.water[nid] = max(0.0, self.water[nid] + self.surge_rate_m + noise)

        # 2. Rainfall accumulates everywhere, scaled down on high ground (runoff).
        for nid, node in self.city.nodes.items():
            runoff = max(0.25, 1.0 - node.elevation_m / 16.0)
            self.water[nid] += rainfall_mm_hr * RAIN_FACTOR * runoff

        # 3. Head-driven flow along edges (computed against a frozen copy).
        deltas: dict[str, float] = {nid: 0.0 for nid in self.city.nodes}
        snapshot = dict(self.water)

        def head_of(nid: str) -> float:
            return self.city.nodes[nid].elevation_m + snapshot[nid]

        for edge in self.city.edges.values():
            diff = head_of(edge.a) - head_of(edge.b)
            hi, lo = (edge.a, edge.b) if diff > 0 else (edge.b, edge.a)
            flow = min(abs(diff) * FLOW_K, snapshot[hi] * 0.5)
            if flow > 0:
                deltas[hi] -= flow
                deltas[lo] += flow

        # 4. Apply flow + passive drainage.
        for nid in self.city.nodes:
            self.water[nid] = max(0.0, self.water[nid] + deltas[nid])
            if nid not in self.sources:
                self.water[nid] = max(0.0, self.water[nid] - DRAIN_RATE)

    def spike(self, levels: dict[str, float]) -> None:
        for nid, amount in levels.items():
            if nid in self.water:
                self.water[nid] += amount

    def edge_impassable(self, edge_id: str) -> bool:
        e = self.city.edges[edge_id]
        threshold = e.flooded_threshold_m
        return self.water[e.a] > threshold or self.water[e.b] > threshold

    def node_flooded(self, node_id: str) -> bool:
        return self.water[node_id] > 0.45

    def depth_category(self, node_id: str) -> str:
        w = self.water[node_id]
        if w < 0.1:
            return "dry"
        if w < 0.45:
            return "ponding"
        if w < 1.0:
            return "flooded"
        return "severe"
