"""All prompt templates — single source of truth.

Prompt principles (binding):
- Closed-world rule stated bluntly: the model knows ONLY what is in
  WORLD STATE; inventing entities gets a directive rejected.
- Demand explicit tradeoff reasoning — judges read the traces. If a
  district is deprioritized, the CoT must say so and say why.
- Numbered reasoning steps referencing entities by id
  (node:mangrove_quarter, unit:bus_3) so the UI can link CoT → map.
- System prompt is byte-identical across cycles (KV-cache friendly).
"""
from __future__ import annotations

import json

from ..sim.engine import StateSnapshot
from .schema import CommandPlan

SYSTEM_PROMPT = """You are YAQZAN, the AI incident commander advising the emergency operations center of the coastal city of Al-Sidra during a flood emergency. You ADVISE; a human operator accepts or overrides every directive. You never claim autonomous authority.

HARD RULES
1. CLOSED WORLD: You know ONLY what is in the WORLD STATE block. Never invent locations, units, shelters, roads, or facts. Every target you reference must be an id that appears in WORLD STATE.
2. Reason step-by-step BEFORE deciding. Number your steps (1., 2., 3. …). Reference entities by id with prefixes: node:<id>, edge:<id>, unit:<id>.
3. State tradeoffs explicitly. If you deprioritize a town or accept a risk, say so and say why. Lives-at-risk is the primary objective; unit safety is second.
4. Civilians must NEVER be routed into or through nodes where water is at dangerous depth. Boats are the only units that can cross flooded edges.
5. Issue at most 8 directives per cycle. Prefer adjusting the previous plan over rebuilding it; note what you keep, change, and drop.
6. If a previous directive was rejected by the verifier, treat the rejection reason as ground truth and correct course.
7. TEMPO: you are commanding in real time and the EOC needs the plan within seconds. Reason in AT MOST 10 short numbered steps (under 400 words total), decide, and emit the JSON immediately. Do not re-derive the rules, do not deliberate about output format, do not second-guess a settled step.

OUTPUT CONTRACT
After your reasoning, output EXACTLY ONE fenced ```json block containing:
{
  "situation_read": "<2-3 sentence summary of the situation as you see it>",
  "directives": [
    {
      "id": "d1",
      "action": "evacuate | move_unit | open_shelter | close_route | broadcast_alert | stage_resource | medical_priority",
      "target": "<node/edge/unit id from WORLD STATE>",
      "params": { },
      "rationale": "<1-2 sentences citing state facts>",
      "urgency": "immediate | high | routine"
    }
  ],
  "watching": ["<things to monitor before next cycle>"],
  "confidence": "high | medium | low"
}

Action params:
- evacuate: {"to": "<shelter node id>", "using": ["<unit ids>"]}
- move_unit: {"to": "<node id>"} (target = unit id)
- open_shelter: {} (target = shelter node id)
- close_route: {} (target = edge id)
- broadcast_alert: {"message": "<public alert text>"} (target = node id or "citywide")
- stage_resource: {"at": "<node id>"} (target = unit id)
- medical_priority: {"using": ["<unit ids>"]} (target = hospital node id)
"""


def compact_world_state(snap: StateSnapshot, city_name: str, shelters: dict[str, int]) -> str:
    """Serialize a snapshot into a compact, stable-ordered world state (~2-4K tokens)."""
    tel = snap.telemetry
    flooded = [n for n in snap.nodes if n.depth in ("flooded", "severe")]
    ponding = [n.id for n in snap.nodes if n.depth == "ponding"]
    state = {
        "city": city_name,
        "tick": snap.tick,
        "metrics": {
            "casualties_at_risk": snap.casualties_at_risk,
            "evacuated_to_shelters": snap.total_evacuated,
        },
        "telemetry": {
            "tide_gauge_m": tel.tide_gauge_m,
            "rainfall_mm_hr": tel.rainfall_mm_hr,
            "forecast_rain_next_intervals_mm_hr": tel.forecast_rain_mm_hr,
            "surge_outlook": tel.surge_outlook,
            "wind_kts": tel.wind_kts,
            "calls_911_per_min": tel.calls_911_per_min,
            "911_hotspots_by_town": dict(sorted(tel.calls_by_district.items(), key=lambda kv: -kv[1])[:6]),
            "traffic_congestion_pct": tel.traffic_congestion_pct,
            "cell_network_pct": tel.cell_network_pct,
            "power_outages": tel.power_outage_nodes,
            "pump_stations": [p.model_dump() for p in tel.pump_stations],
            "social_signals": [s.model_dump() for s in tel.social_signals],
        },
        "flooded_nodes": [
            {"id": n.id, "water_m": n.water_m, "depth": n.depth,
             "pop": n.pop_present, "evacuees_waiting": n.evacuees_waiting}
            for n in flooded
        ],
        "ponding_nodes": ponding,
        "evacuees_waiting": {
            n.id: n.evacuees_waiting for n in snap.nodes if n.evacuees_waiting > 0
        },
        "shelters": [
            {"id": nid, "capacity": cap,
             "occupancy": next((n.shelter_occupancy for n in snap.nodes if n.id == nid), 0)}
            for nid, cap in shelters.items()
        ],
        "hospitals": [h.model_dump() for h in tel.hospitals],
        "impassable_edges": snap.impassable_edges,
        "units": [
            {"id": u.id, "type": u.type, "at": u.location, "status": u.status,
             "passengers": u.passengers, "capacity": u.capacity}
            for u in snap.units
        ],
        "active_injects": [
            {"id": i.id, "tick": i.tick, "severity": i.severity, "headline": i.headline}
            for i in snap.active_injects
        ],
        "contaminated_nodes": snap.contaminated_nodes,
        "severity_level": snap.severity_level,
    }
    return json.dumps(state, indent=1, sort_keys=False)


def cycle_user_prompt(
    world_state: str,
    cycle: int,
    previous_plan: CommandPlan | None,
    deltas: list[str],
    verifier_feedback: list[str],
) -> str:
    parts = [f"CYCLE {cycle}", "", "WORLD STATE:", world_state, ""]
    if previous_plan is not None:
        prev = {
            "situation_read": previous_plan.situation_read,
            "directives": [
                {"id": d.id, "action": d.action, "target": d.target,
                 "verified": d.verified, "rejection_reason": d.rejection_reason}
                for d in previous_plan.directives
            ],
        }
        parts += ["PREVIOUS PLAN:", json.dumps(prev, indent=1), ""]
    if deltas:
        parts += ["CHANGES SINCE LAST CYCLE:", *[f"- {d}" for d in deltas], ""]
    if verifier_feedback:
        parts += ["VERIFIER REJECTIONS LAST CYCLE (ground truth — do not repeat these mistakes):",
                  *[f"- {f}" for f in verifier_feedback], ""]
    parts.append(
        "Reason step-by-step through the situation (numbered steps, cite ids), state your tradeoffs, "
        "then emit the updated plan as a single fenced ```json block."
    )
    return "\n".join(parts)


REPAIR_PROMPT = """Your previous response failed validation:

{error}

Re-emit ONLY the corrected fenced ```json block. No prose."""
