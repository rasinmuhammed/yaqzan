"""City telemetry synthesis.

Everything a real emergency operations center ingests, derived
deterministically from sim state + seeded noise: tide gauges, rain
radar, pump stations, 911 call volume, traffic, power grid, hospital
status, and social-media signal. This stream is what K2 reasons over —
it is the realism layer of the demo.
"""
from __future__ import annotations

import random

from pydantic import BaseModel, Field

from .city import CityGraph
from .flood import FloodModel


class PumpStation(BaseModel):
    node: str
    status: str            # nominal | overwhelmed | failed | partial
    outflow_pct: int


class HospitalStatus(BaseModel):
    node: str
    name: str
    bed_occupancy_pct: int
    on_backup_power: bool
    generator_failed: bool
    patients_critical: int


class SocialSignal(BaseModel):
    text: str
    volume: int            # posts/min
    credibility: str       # verified | unverified | debunked


class CityTelemetry(BaseModel):
    tick: int
    tide_gauge_m: float
    rainfall_mm_hr: float
    # Met-office layer: what the city knows about the next hours.
    forecast_rain_mm_hr: list[float] = Field(default_factory=list)
    surge_outlook: str = "holding"   # intensifying | holding | easing | receding
    wind_kts: int = 0
    pump_stations: list[PumpStation]
    calls_911_per_min: int
    calls_by_district: dict[str, int]
    traffic_congestion_pct: int
    power_outage_nodes: list[str]
    hospitals: list[HospitalStatus]
    cell_network_pct: int
    social_signals: list[SocialSignal] = Field(default_factory=list)
    contamination_alerts: list[str] = Field(default_factory=list)


class TelemetrySynth:
    def __init__(self, city: CityGraph, seed: int) -> None:
        self.city = city
        self.rng = random.Random(seed + 7)
        self.generator_down: set[str] = set()
        self.pump_status: dict[str, tuple[str, int]] = {
            n.id: ("nominal", 100) for n in city.nodes.values() if n.is_pump_station
        }
        self.rumor_active = False
        self.cell_cap_override: int | None = None  # set by cell_tower_collapse inject

    def synthesize(
        self,
        tick: int,
        flood: FloodModel,
        rainfall: float,
        forecast_rain: list[float] | None = None,
        forced_outages: set[str] | None = None,
        contaminated: set[str] | None = None,
    ) -> CityTelemetry:
        rng = random.Random(self.rng.randint(0, 10**9))  # per-tick stream, still seeded
        coast = [nid for nid in flood.sources]
        tide = max(flood.water[n] for n in coast) + rng.uniform(-0.03, 0.03)

        calls: dict[str, int] = {}
        for nid, node in self.city.nodes.items():
            w = flood.water[nid]
            base = node.population / 4000
            stress = w * 14 + (6 if nid in self.generator_down else 0)
            # Contamination spikes panic calls.
            if contaminated and nid in contaminated:
                stress += 12
            v = int(base * stress + rng.uniform(0, 1.5))
            if v > 0:
                calls[nid] = v
        total_calls = sum(calls.values())

        flooded_n = sum(1 for nid in self.city.nodes if flood.node_flooded(nid))
        congestion = min(97, 18 + flooded_n * 6 + int(total_calls * 0.4) + rng.randint(-3, 3))

        # Power outages: flood-based + forced (from inject).
        outages = [
            nid for nid, node in self.city.nodes.items()
            if flood.water[nid] > 0.35 and node.elevation_m < 4.0
        ]
        if forced_outages:
            for nid in forced_outages:
                if nid not in outages:
                    outages.append(nid)

        hospitals = []
        for node in self.city.nodes.values():
            if not node.is_hospital:
                continue
            w = flood.water[node.id]
            hospitals.append(HospitalStatus(
                node=node.id,
                name=node.name,
                bed_occupancy_pct=min(100, 62 + int(total_calls * 0.6) + rng.randint(-4, 4)),
                on_backup_power=node.id in outages or node.id in self.generator_down,
                generator_failed=node.id in self.generator_down,
                patients_critical=38 if node.id in self.generator_down else int(4 + w * 10),
            ))

        pumps = []
        for nid, (status, pct) in self.pump_status.items():
            if status == "nominal" and flood.water[nid] > 0.8:
                status, pct = "overwhelmed", 55
                self.pump_status[nid] = (status, pct)
            # Forced power outage kills pump efficiency.
            if forced_outages and nid in forced_outages and status == "nominal":
                status, pct = "partial", 35
                self.pump_status[nid] = (status, pct)
            pumps.append(PumpStation(node=nid, status=status, outflow_pct=pct))

        signals: list[SocialSignal] = []
        if flooded_n >= 2:
            signals.append(SocialSignal(
                text="Videos of seawater on the Corniche spreading fast",
                volume=40 + flooded_n * 22 + rng.randint(0, 30), credibility="verified"))
        if flooded_n >= 4:
            signals.append(SocialSignal(
                text="Drone footage shows Old Harbor submerged to first-floor windows",
                volume=60 + flooded_n * 15 + rng.randint(0, 25), credibility="verified"))
        if self.rumor_active:
            signals.append(SocialSignal(
                text="'Heritage Square shelter is OPEN and dry' — being shared widely. FALSE: area is taking water.",
                volume=300 + rng.randint(0, 120), credibility="unverified"))
        if contaminated:
            signals.append(SocialSignal(
                text=f"Chemical smell reported near Saltflat Industrial — residents posting about burning eyes, evacuation urged",
                volume=200 + rng.randint(0, 80), credibility="verified"))
            signals.append(SocialSignal(
                text="Rumor: 'toxic cloud heading north to Airport' — UNCONFIRMED, likely exaggerated",
                volume=150 + rng.randint(0, 60), credibility="unverified"))
        if flooded_n >= 6:
            signals.append(SocialSignal(
                text="Reports of people trapped on rooftops in Mangrove Quarter — please send help",
                volume=100 + rng.randint(0, 40), credibility="verified"))
        if total_calls > 200:
            signals.append(SocialSignal(
                text="Live stream of rescue boat operations going viral — 50k viewers",
                volume=80 + rng.randint(0, 30), credibility="verified"))

        rate = flood.surge_rate_m
        outlook = (
            "intensifying" if rate > 0.15
            else "holding" if rate > 0.05
            else "easing" if rate > 0
            else "receding"
        )
        # Forecast carries honest met-office uncertainty.
        fc = [round(max(0.0, v + rng.uniform(-2.5, 2.5)), 1) for v in (forecast_rain or [])]

        # Cell network: flood + tower collapse.
        cell = max(40, 100 - flooded_n * 5 - rng.randint(0, 4))
        if self.cell_cap_override is not None:
            cell = min(cell, self.cell_cap_override + rng.randint(-3, 3))

        # Contamination alerts in telemetry.
        contam_alerts = []
        if contaminated:
            contam_alerts = [f"HAZMAT Zone: {nid}" for nid in sorted(contaminated)]

        return CityTelemetry(
            tick=tick,
            tide_gauge_m=round(max(0.0, tide), 2),
            rainfall_mm_hr=round(rainfall, 1),
            forecast_rain_mm_hr=fc,
            surge_outlook=outlook,
            wind_kts=int(14 + rainfall * 0.5 + rng.uniform(-3, 3)),
            pump_stations=pumps,
            calls_911_per_min=total_calls,
            calls_by_district=calls,
            traffic_congestion_pct=congestion,
            power_outage_nodes=outages,
            hospitals=hospitals,
            cell_network_pct=max(25, cell),
            social_signals=signals,
            contamination_alerts=contam_alerts,
        )
