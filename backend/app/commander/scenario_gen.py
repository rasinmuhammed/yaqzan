"""Prompt-to-disaster: K2 authors a runnable scenario for Al-Sidra.

The model generates the *disaster*, never the city: hazard parameters,
seeded rainfall, water sources, and a timed inject arc on top of the
hand-crafted graph. A validator mirroring the directive verifier keeps the
output inside the engine's closed world, with one repair round-trip.
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from ..sim.city import CityGraph
from .k2_client import StreamEvent
from .schema import FENCED_JSON

# The engine's working inject-effect vocabulary (see engine.apply_inject).
EFFECT_KEYS = {
    "surge_rate_m", "water_spike", "destroy_edge", "hospital_generator_down",
    "crowd_surge", "power_outage", "cell_degradation", "add_water_source",
    "contaminate",
}


class GenInject(BaseModel):
    id: str
    tick: int
    severity: Literal["low", "medium", "high", "critical"]
    headline: str
    effect: dict = Field(default_factory=dict)


class GeneratedScenario(BaseModel):
    name: str
    description: str
    seed: int = Field(ge=0)  # any non-negative int seeds the RNG fine
    ticks: int = Field(ge=30, le=90)
    base_surge_rate_m: float = Field(ge=0.0, le=0.3)
    rainfall_points: list[float] = Field(min_length=8, max_length=16)
    water_sources: list[str] = Field(min_length=1, max_length=4)
    injects: list[GenInject] = Field(min_length=4, max_length=10)


def validate_effect(eff: dict, city: CityGraph) -> list[str]:
    """Closed-world check of a single inject effect (used by live events)."""
    errors: list[str] = []
    hospitals = {nid for nid, n in city.nodes.items() if n.is_hospital}
    unknown = set(eff) - EFFECT_KEYS
    if unknown:
        errors.append(f"unknown effect keys {sorted(unknown)}; allowed: {sorted(EFFECT_KEYS)}")
    if "destroy_edge" in eff and eff["destroy_edge"] not in city.edges:
        errors.append(f"destroy_edge '{eff['destroy_edge']}' is not an edge id")
    if "water_spike" in eff:
        if not isinstance(eff["water_spike"], dict):
            errors.append("water_spike must map node ids to meters")
        else:
            for nid in eff["water_spike"]:
                if nid not in city.nodes:
                    errors.append(f"water_spike node '{nid}' does not exist")
    if "hospital_generator_down" in eff and eff["hospital_generator_down"] not in hospitals:
        errors.append(f"'{eff.get('hospital_generator_down')}' is not a hospital node")
    if "crowd_surge" in eff:
        cs = eff["crowd_surge"]
        if not isinstance(cs, dict) or cs.get("target") not in city.nodes:
            errors.append("crowd_surge.target must be an existing node id")
        elif not isinstance(cs.get("people"), int) or not 100 <= cs["people"] <= 5000:
            errors.append("crowd_surge.people must be an integer 100..5000")
    for key in ("power_outage", "contaminate"):
        if key in eff and (not isinstance(eff[key], list) or any(n not in city.nodes for n in eff[key])):
            errors.append(f"{key} must be a list of existing node ids")
    if "add_water_source" in eff and eff["add_water_source"] not in city.nodes:
        errors.append(f"add_water_source '{eff['add_water_source']}' does not exist")
    if "cell_degradation" in eff and not (
        isinstance(eff["cell_degradation"], int) and 20 <= eff["cell_degradation"] <= 100
    ):
        errors.append("cell_degradation must be an integer 20..100")
    if "surge_rate_m" in eff and not (
        isinstance(eff["surge_rate_m"], (int, float)) and -0.15 <= eff["surge_rate_m"] <= 0.4
    ):
        errors.append("surge_rate_m must be within -0.15..0.4")
    return errors


def validate_against_city(gen: GeneratedScenario, city: CityGraph) -> list[str]:
    """Closed-world checks the schema cannot express. Returns model-readable errors."""
    errors: list[str] = []
    coastal = {nid for nid, n in city.nodes.items() if n.elevation_m < 3.0}
    for nid in gen.water_sources:
        if nid not in city.nodes:
            errors.append(f"water_sources: '{nid}' is not a node id")
        elif nid not in coastal:
            errors.append(f"water_sources: '{nid}' is high ground (elevation >= 3m); pick a coastal node")
    if any(p < 0 or p > 90 for p in gen.rainfall_points):
        errors.append("rainfall_points must be within 0..90 mm/hr")
    hospitals = {nid for nid, n in city.nodes.items() if n.is_hospital}
    seen_ids: set[str] = set()
    for inj in gen.injects:
        tag = f"inject '{inj.id}'"
        if inj.id in seen_ids:
            errors.append(f"{tag}: duplicate id")
        seen_ids.add(inj.id)
        if not 1 <= inj.tick <= gen.ticks:
            errors.append(f"{tag}: tick {inj.tick} outside 1..{gen.ticks}")
        unknown = set(inj.effect) - EFFECT_KEYS
        if unknown:
            errors.append(f"{tag}: unknown effect keys {sorted(unknown)}; allowed: {sorted(EFFECT_KEYS)}")
        eff = inj.effect
        if "destroy_edge" in eff and eff["destroy_edge"] not in city.edges:
            errors.append(f"{tag}: destroy_edge '{eff['destroy_edge']}' is not an edge id")
        if "water_spike" in eff:
            if not isinstance(eff["water_spike"], dict):
                errors.append(f"{tag}: water_spike must map node ids to meters")
            else:
                for nid in eff["water_spike"]:
                    if nid not in city.nodes:
                        errors.append(f"{tag}: water_spike node '{nid}' does not exist")
        if "hospital_generator_down" in eff and eff["hospital_generator_down"] not in hospitals:
            errors.append(f"{tag}: '{eff.get('hospital_generator_down')}' is not a hospital node")
        if "crowd_surge" in eff:
            cs = eff["crowd_surge"]
            if not isinstance(cs, dict) or cs.get("target") not in city.nodes:
                errors.append(f"{tag}: crowd_surge.target must be an existing node id")
            elif not isinstance(cs.get("people"), int) or not 100 <= cs["people"] <= 5000:
                errors.append(f"{tag}: crowd_surge.people must be an integer 100..5000")
        for key in ("power_outage", "contaminate"):
            if key in eff:
                if not isinstance(eff[key], list) or any(n not in city.nodes for n in eff[key]):
                    errors.append(f"{tag}: {key} must be a list of existing node ids")
        if "add_water_source" in eff and eff["add_water_source"] not in city.nodes:
            errors.append(f"{tag}: add_water_source '{eff['add_water_source']}' does not exist")
        if "cell_degradation" in eff and not (
            isinstance(eff["cell_degradation"], int) and 20 <= eff["cell_degradation"] <= 100
        ):
            errors.append(f"{tag}: cell_degradation must be an integer 20..100")
        if "surge_rate_m" in eff and not (
            isinstance(eff["surge_rate_m"], (int, float)) and -0.15 <= eff["surge_rate_m"] <= 0.4
        ):
            errors.append(f"{tag}: surge_rate_m must be within -0.15..0.4")
    return errors


def city_digest(city: CityGraph) -> str:
    """Compact city description the designer reasons over."""
    nodes = [
        {
            "id": n.id, "elevation_m": n.elevation_m, "population": n.population,
            **({"shelter_capacity": n.shelter_capacity} if n.is_shelter else {}),
            **({"hospital": True} if n.is_hospital else {}),
            **({"pump_station": True} if n.is_pump_station else {}),
        }
        for n in city.nodes.values()
    ]
    return json.dumps({"city": city.name, "nodes": nodes, "edge_ids": sorted(city.edges)}, indent=1)


DESIGNER_SYSTEM = """You are the exercise designer for the Al-Sidra emergency operations center. You author realistic, dramatically paced flood-disaster scenarios for command training. You know ONLY the city description provided; every node and edge id you reference must exist in it.

Design principles:
- A 3-act arc across the tick range: calm build-up, breach/cascade in the middle, recovery at the end.
- 4 to 10 timed injects that force visible re-planning: infrastructure failures, misinformation, secondary hazards. Headlines are broadcast on screen; write them tight and factual, no em dashes.
- Surge enters from low coastal nodes. Severity must be survivable: a commander acting well should be able to protect most of the population.
- TEMPO: reason in AT MOST 8 short numbered steps (under 250 words), then emit the JSON immediately. Do not re-derive these rules or draft the JSON twice.
- The JSON must be strict: double quotes, no comments, no trailing commas.

After reasoning, output EXACTLY ONE fenced ```json block:
{
  "name": "<short scenario title>",
  "description": "<one sentence for the scenario selector>",
  "seed": <int>,
  "ticks": <30-90>,
  "base_surge_rate_m": <0.0-0.3>,
  "rainfall_points": [<8-16 floats, mm/hr, the curve is interpolated>],
  "water_sources": ["<1-4 coastal node ids>"],
  "injects": [
    {"id": "<slug>", "tick": <int>, "severity": "low|medium|high|critical",
     "headline": "<broadcast text>",
     "effect": {<zero or more of: surge_rate_m, water_spike {node: meters},
       destroy_edge "<edge id>", hospital_generator_down "<hospital node>",
       crowd_surge {"target": "<node>", "people": <100-5000>},
       power_outage ["<nodes>"], cell_degradation <20-100>,
       add_water_source "<node>", contaminate ["<nodes>"]>}
    }
  ]
}"""


def _loosen_json(raw: str) -> str:
    """Repair the two LLM-JSON faults worth tolerating: // comments and
    trailing commas. Anything else still fails loudly."""
    no_comments = re.sub(r"^\s*//.*$", "", raw, flags=re.MULTILINE)
    return re.sub(r",(\s*[}\]])", r"\1", no_comments)


def parse_generated(completion: str) -> GeneratedScenario:
    matches = FENCED_JSON.findall(completion)
    if not matches:
        raise ValueError("No fenced ```json block found; emit the scenario as one fenced JSON block.")
    last_err: Exception | None = None
    # Models sometimes emit a draft block before the final one: take the
    # last block that parses, complain about the last block if none do.
    for raw in reversed(matches):
        try:
            data = json.loads(_loosen_json(raw))
        except json.JSONDecodeError as e:
            last_err = last_err or ValueError(f"JSON syntax error: {e}")
            continue
        try:
            return GeneratedScenario(**data)
        except ValidationError as e:
            raise ValueError(f"Schema validation failed: {e}") from e
    raise last_err if last_err else ValueError("No parseable JSON block found.")


def interpolate_curve(points: list[float], ticks: int) -> list[float]:
    if len(points) >= ticks:
        return [round(p, 1) for p in points[:ticks]]
    out: list[float] = []
    for i in range(ticks):
        pos = (i / (ticks - 1)) * (len(points) - 1)
        lo = int(pos)
        hi = min(lo + 1, len(points) - 1)
        frac = pos - lo
        out.append(round(points[lo] * (1 - frac) + points[hi] * frac, 1))
    return out


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")
    return s[:40] or "scenario"


def assemble_scenario(gen: GeneratedScenario, base: dict, prompt: str) -> dict:
    """Generated disaster + hand-crafted city = runnable scenario file."""
    return {
        "city_name": base["city_name"],
        "scenario": gen.name,
        "description": gen.description,
        "generated_by": "K2 Think V2",
        "authoring_prompt": prompt,
        "seed": gen.seed,
        "ticks": gen.ticks,
        "water_sources": gen.water_sources,
        "base_surge_rate_m": gen.base_surge_rate_m,
        "rainfall_curve": interpolate_curve(gen.rainfall_points, gen.ticks),
        "nodes": base["nodes"],
        "edges": base["edges"],
        "units": base["units"],
        "injects": [i.model_dump() for i in gen.injects],
    }


def scripted_fallback(prompt: str, city: CityGraph) -> GeneratedScenario:
    """Deterministic offline generator: a parameterized flood keyed off the prompt."""
    p = prompt.lower()
    heavy = any(w in p for w in ("category", "super", "extreme", "worst", "severe", "tsunami"))
    rate = 0.22 if heavy else 0.14
    seed = sum(ord(c) for c in prompt) % 100000
    coastal = sorted(nid for nid, n in city.nodes.items() if n.elevation_m < 1.5)[:3]
    hospital = next(nid for nid, n in city.nodes.items() if n.is_hospital)
    edge = sorted(city.edges)[len(prompt) % len(city.edges)]
    return GeneratedScenario(
        name=f"Exercise: {prompt[:34]}",
        description=f"Offline-generated drill from prompt: {prompt[:80]}",
        seed=seed,
        ticks=60,
        base_surge_rate_m=rate,
        rainfall_points=[2, 8, 20, 38, 55 if heavy else 42, 50, 34, 20, 10, 4, 1, 0],
        water_sources=coastal,
        injects=[
            GenInject(id="surge_build", tick=4, severity="high",
                      headline="Surge intensifying along the seafront", effect={"surge_rate_m": rate + 0.05}),
            GenInject(id="breach", tick=12, severity="critical",
                      headline="Defenses breached. Seawater entering the lower city",
                      effect={"water_spike": {coastal[0]: 1.0}}),
            GenInject(id="route_loss", tick=18, severity="high",
                      headline="Key route lost to structural failure", effect={"destroy_edge": edge}),
            GenInject(id="hospital_dark", tick=24, severity="critical",
                      headline="Hospital backup power failing",
                      effect={"hospital_generator_down": hospital}),
            GenInject(id="recovery", tick=42, severity="low",
                      headline="Peak passed. Water beginning to recede", effect={"surge_rate_m": -0.06}),
        ],
    )


def save_generated(scenario: dict, scenario_dir: Path) -> str:
    fname = f"generated_{slugify(scenario['scenario'])}.json"
    (scenario_dir / fname).write_text(json.dumps(scenario, indent=2, ensure_ascii=False) + "\n")
    return fname


__all__ = [
    "DESIGNER_SYSTEM", "GeneratedScenario", "GenInject", "StreamEvent",
    "assemble_scenario", "city_digest", "parse_generated", "save_generated",
    "scripted_fallback", "validate_against_city",
]
