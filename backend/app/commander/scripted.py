"""Scripted offline commander.

Implements the same streaming interface as K2Client but reasons locally
over the WORLD STATE JSON embedded in the user prompt. Purpose:
(1) the full demo runs with zero network access before API approval,
(2) deterministic fixture transcripts for tests and frontend work.

It is intentionally a *plausible heuristic officer*, not a genius: it
picks shelters by remaining capacity and distance without re-checking
water depth — so the verifier visibly catches it when a shelter floods.
That rejection path is part of the demo.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
import re
from collections.abc import AsyncIterator

from .k2_client import StreamEvent

WORLD_STATE_RE = re.compile(r"WORLD STATE:\n(\{.*?\n\})\n", re.DOTALL)
TOKEN_DELAY_S = 0.012  # ~mimics K2-on-Cerebras streaming cadence


class ScriptedCommander:
    def __init__(self, token_delay_s: float = TOKEN_DELAY_S) -> None:
        self.delay = token_delay_s
        self._opened_shelters: set[str] = set()
        self._medical_tasked: set[str] = set()
        self._rumor_countered = False
        self._alerted: set[str] = set()
        self._chem_responded = False
        self._comms_noted = False
        self._secondary_breach_responded = False

    async def stream(self, messages: list[dict]) -> AsyncIterator[StreamEvent]:
        user = messages[-1]["content"]
        m = WORLD_STATE_RE.search(user)
        state = json.loads(m.group(1)) if m else {}
        reasoning, plan = self._decide(state, user)
        for chunk in _chunks(reasoning):
            yield StreamEvent("reasoning", chunk)
            await asyncio.sleep(self.delay)
        content = "```json\n" + json.dumps(plan, indent=1) + "\n```"
        for chunk in _chunks(content, size=24):
            yield StreamEvent("content", chunk)
            await asyncio.sleep(self.delay / 2)

    # ---- heuristic planning ----

    def _decide(self, s: dict, user_prompt: str) -> tuple[str, dict]:
        tick = s.get("tick", 0)
        flooded = s.get("flooded_nodes", [])
        shelters = s.get("shelters", [])
        units = s.get("units", [])
        hospitals = s.get("hospitals", [])
        signals = s.get("telemetry", {}).get("social_signals", [])
        at_risk = s.get("metrics", {}).get("casualties_at_risk", 0)
        impassable = set(s.get("impassable_edges", []))
        rejections = "VERIFIER REJECTIONS" in user_prompt
        contaminated = set(s.get("contaminated_nodes", []))

        steps: list[str] = []
        directives: list[dict] = []
        n_d = 0

        def add(action: str, target: str, params: dict, rationale: str, urgency: str) -> None:
            nonlocal n_d
            n_d += 1
            directives.append({
                "id": f"d{n_d}", "action": action, "target": target,
                "params": params, "rationale": rationale, "urgency": urgency,
            })

        tel = s.get("telemetry", {})
        cell_pct = tel.get("cell_network_pct", 100)
        steps.append(
            f"1. Situation intake at tick {tick}: {len(flooded)} districts at flood depth, "
            f"{at_risk:,} people at risk, 911 volume {tel.get('calls_911_per_min', 0)}/min, "
            f"{len(impassable)} road segments impassable"
            f"{f', {len(contaminated)} contaminated zones' if contaminated else ''}"
            f"{f', cell network at {cell_pct}%' if cell_pct < 80 else ''}."
        )

        # Forecast-driven posture: act on what is coming, not just what is here.
        fc = tel.get("forecast_rain_next_intervals_mm_hr", [])
        outlook = tel.get("surge_outlook", "holding")
        if fc:
            peak = max(fc)
            now_rain = tel.get("rainfall_mm_hr", 0)
            if peak > now_rain + 8 and outlook in ("intensifying", "holding"):
                steps.append(
                    f"2. Forecast check: rain climbing toward {peak:.0f}mm/hr within six intervals and surge "
                    f"{outlook}. Anything I stage now arrives before the peak; anything I delay arrives during it. "
                    "Biasing this cycle toward pre-positioning."
                )
            elif outlook == "receding":
                steps.append(
                    f"2. Forecast check: surge receding, rain tapering to {min(fc):.0f}mm/hr. "
                    "Shifting from rescue posture to recovery; keeping shuttles running until queues clear."
                )
            else:
                steps.append(
                    f"2. Forecast check: rain near {peak:.0f}mm/hr, surge {outlook}. No posture change."
                )

        # Chemical spill response (once): declare exclusion zone, reroute.
        if contaminated and not self._chem_responded:
            self._chem_responded = True
            safe_shelters = [sh for sh in shelters
                            if sh["id"] not in contaminated and sh["capacity"] - sh["occupancy"] > 100]
            steps.append(
                f"{len(steps)+1}. HAZMAT ASSESSMENT: {', '.join(f'node:{c}' for c in contaminated)} are contaminated. "
                f"All evacuation routing must AVOID these nodes. Re-checking every shelter and staging point — "
                f"{len(safe_shelters)} shelters remain safe. Any prior plan routing through contaminated zones is invalid."
            )
            add("broadcast_alert", "citywide",
                {"message": f"HAZMAT WARNING: Chemical contamination at {', '.join(contaminated)}. "
                            "Do NOT enter these areas. Emergency services are setting up decontamination."},
                f"Contamination at {', '.join(f'node:{c}' for c in contaminated)} poses immediate inhalation/contact "
                "risk — broadcast required before any movement orders are issued.",
                "immediate")

        # Comms degradation response (once).
        if cell_pct < 70 and not self._comms_noted:
            self._comms_noted = True
            steps.append(
                f"{len(steps)+1}. Communications: cell network at {cell_pct}% — broadcast alerts may not reach "
                "all residents. Prioritizing physical-presence directives (rescue teams, vehicle PA systems) "
                "over digital broadcasts in eastern districts."
            )

        # Secondary breach response (once).
        if "pearl_wharf" in [n.get("id") for n in flooded] and not self._secondary_breach_responded:
            for n in flooded:
                if n.get("id") == "pearl_wharf" and n.get("water_m", 0) > 1.0:
                    self._secondary_breach_responded = True
                    steps.append(
                        f"{len(steps)+1}. CRITICAL: Pearl Wharf breach has created a second ingress point. "
                        "Lantern District is now threatened from the west — this was a safe corridor. "
                        "Reprioritizing: any assets staged at or routed through Lantern need immediate redirection."
                    )
                    # Alert Lantern District.
                    if "lantern_district" not in self._alerted:
                        self._alerted.add("lantern_district")
                        add("broadcast_alert", "lantern_district",
                            {"message": "URGENT: Lantern District — water rising from Pearl Wharf breach. "
                                        "Move to upper floors immediately. Do not use ground-floor corridors."},
                            "Secondary breach has changed the threat map — Lantern District residents "
                            "previously in a safe zone now face rising water.",
                            "immediate")
                    break

        # Shelters: open high-ground capacity early (exclude contaminated).
        usable = [sh for sh in shelters
                  if sh["capacity"] - sh["occupancy"] > 100
                  and sh["id"] not in contaminated]
        usable.sort(key=lambda sh: -(sh["capacity"] - sh["occupancy"]))
        for sh in usable[:2]:
            if sh["id"] not in self._opened_shelters:
                self._opened_shelters.add(sh["id"])
                add("open_shelter", sh["id"], {},
                    f"node:{sh['id']} has {sh['capacity'] - sh['occupancy']} places free; opening ahead of inflow.",
                    "high")
        steps.append(
            f"{len(steps)+1}. Shelter posture: prioritizing " +
            (", ".join(f"node:{sh['id']}" for sh in usable[:2]) if usable else "none available") +
            " by remaining capacity. " +
            ("Verifier rejected a previous shelter assignment; re-checking water depth at receiving nodes." if rejections else "")
        )

        # Evacuations: worst flooded nodes by population × water, plus any node
        # where mobilized civilians are still waiting for transport.
        flooded_sorted = sorted(flooded, key=lambda n: -(n["pop"] * n["water_m"]))
        waiting = s.get("evacuees_waiting", {})
        targets: list[dict] = list(flooded_sorted)
        target_ids = {n["id"] for n in targets}
        for nid, count in sorted(waiting.items(), key=lambda kv: -kv[1]):
            if nid not in target_ids and count > 50:
                targets.append({"id": nid, "water_m": 0.0, "pop": count})
        idle_buses = [u["id"] for u in units
                      if u["type"] in ("bus", "rescue_team") and u["status"] in ("idle", "blocked")]
        idle_boats = [u["id"] for u in units if u["type"] == "boat" and u["status"] in ("idle", "blocked")]
        evac_notes = []
        for n in targets[:4]:
            if not usable:
                break
            # Skip contaminated nodes as destinations (but allow evacuation FROM them).
            sh = next((s for s in usable if s["id"] not in contaminated), None)
            if sh is None:
                break
            deep = n["water_m"] > 0.6
            pool = idle_boats if deep else (idle_buses or idle_boats)
            assigned = pool[:2]
            del pool[:2]
            if not assigned:
                continue
            add("evacuate", n["id"], {"to": sh["id"], "using": assigned},
                f"node:{n['id']} at {n['water_m']}m with {n['pop']:,} residents; "
                f"{'boat extraction, streets submerged' if deep else 'road evacuation while routes hold'} "
                f"to node:{sh['id']}."
                f"{' NOTE: evacuating FROM contaminated zone — rescue priority.' if n['id'] in contaminated else ''}",
                "immediate" if deep or n["id"] in contaminated else "high")
            evac_notes.append(
                f"node:{n['id']} ({n['water_m']}m, pop {n['pop']:,}) → node:{sh['id']} "
                f"via {', '.join('unit:' + u for u in assigned)}"
            )
        if evac_notes:
            steps.append(f"{len(steps)+1}. Evacuation triage, worst exposure first: " + "; ".join(evac_notes) + ".")
        if len(flooded_sorted) > 3:
            skipped = ", ".join(f"node:{n['id']}" for n in flooded_sorted[3:6])
            steps.append(
                f"{len(steps)+1}. Tradeoff: deprioritizing {skipped} this cycle: lower population-depth product and no idle "
                f"transport remains. Accepting delay there to concentrate lift where drowning risk is highest."
            )

        # District flood alerts: cheap, immediate exposure reduction for
        # populated flooded nodes we cannot lift out yet.
        alert_notes = []
        for n in flooded_sorted:
            if n["id"] in self._alerted or n["pop"] < 2500 or n_d >= 7:
                continue
            self._alerted.add(n["id"])
            msg = (f"FLOOD ALERT for {n['id']}: move to upper floors NOW; "
                   "do not drive; rescue boats are being staged.")
            if n["id"] in contaminated:
                msg += " CHEMICAL HAZARD: cover face, close windows."
            add("broadcast_alert", n["id"],
                {"message": msg},
                f"node:{n['id']} has {n['pop']:,} residents in {n['water_m']}m of water and no lift "
                "capacity free this cycle; vertical-evacuation order cuts exposure immediately."
                + (f" Contamination adds chemical exposure risk." if n["id"] in contaminated else ""),
                "immediate")
            alert_notes.append(f"node:{n['id']}")
            if len(alert_notes) >= 2:
                break
        if alert_notes:
            steps.append(
                f"{len(steps)+1}. No transport reaches {', '.join(alert_notes)} this cycle, so issuing "
                "vertical-evacuation alerts there. A warning is the only directive that acts at the speed of radio."
            )

        # Hospitals (task the transfer once; ambulances shuttle until done).
        for h in hospitals:
            if h.get("generator_failed") and h["node"] not in self._medical_tasked:
                self._medical_tasked.add(h["node"])
                ambs = [u["id"] for u in units if u["type"] == "ambulance" and u["status"] == "idle"][:2]
                add("medical_priority", h["node"], {"using": ambs},
                    f"node:{h['node']} generator failed with {h['patients_critical']} critical patients; "
                    "transfer to the functioning facility takes precedence over general lift.",
                    "immediate")
                steps.append(
                    f"{len(steps)+1}. Medical: node:{h['node']} is dark: {h['patients_critical']} patients on manual "
                    f"support. Re-tasking {', '.join('unit:' + a for a in ambs) or 'no free ambulance, flagging'} immediately."
                )

        # Rumor response (once): counter-broadcast, attempt to shelter the
        # crowd in place, and re-task a boat for crowd extraction.
        for sig in signals:
            if sig.get("credibility") == "unverified" and not self._rumor_countered:
                if "heritage" in sig.get("text", "").lower():
                    self._rumor_countered = True
                    add("broadcast_alert", "citywide",
                        {"message": "OFFICIAL: Heritage Square shelter is NOT safe. Proceed to University City or Stadium District shelters."},
                        "Unverified viral signal is steering crowds toward rising water; counter-broadcast before footfall peaks.",
                        "immediate")
                    crowd_node = max(
                        (sh["id"] for sh in shelters if waiting.get(sh["id"], 0) > 300),
                        key=lambda nid: waiting.get(nid, 0), default=None,
                    )
                    if crowd_node:
                        add("open_shelter", crowd_node, {},
                            f"Crowd of {waiting.get(crowd_node, 0):,} already on site at node:{crowd_node}; "
                            "sheltering them in place is faster than moving them, if the site is still dry.",
                            "immediate")
                        boat = next((u["id"] for u in units if u["type"] == "boat"), None)
                        if boat and usable:
                            add("evacuate", crowd_node, {"to": usable[0]["id"], "using": [boat]},
                                f"Re-tasking unit:{boat} from shuttle duty: the misdirected crowd at "
                                f"node:{crowd_node} outranks steady-state lift.",
                                "immediate")
                    steps.append(
                        f"{len(steps)+1}. Information hazard: unverified signal at {sig.get('volume')} posts/min is redirecting "
                        "crowds into a flooding node. Counter-messaging first; then attempt shelter-in-place at the site "
                        "(verifier will rule on water depth) and re-task one boat for crowd extraction. Tradeoff accepted: "
                        "the shuttle it leaves loses one round trip."
                    )

        watching = [
            "Water depth trend at the two largest remaining populated coastal nodes",
            "Shelter occupancy vs capacity after this cycle's deliveries",
            "Whether impassable-edge count severs the last dry corridor to the south",
        ]
        if contaminated:
            watching.append("Contamination plume spread — reassessing safe corridors next cycle")
        if cell_pct < 70:
            watching.append("Cell network recovery status — physical dispatch may be needed for alerts")

        severity = len([i for i in s.get("active_injects", []) if i.get("severity") == "critical"])
        confidence = "low" if severity >= 2 or contaminated else ("medium" if severity == 1 or len(flooded) > 8 else "high")
        steps.append(
            f"{len(steps)+1}. Confidence {confidence}: " +
            ("multiple critical injects in play; state is shifting faster than the cycle cadence."
             if confidence != "high" else "situation developing but within forecast envelope.")
            + (" Chemical contamination adds a dimension we cannot model — confidence drops."
               if contaminated else "")
        )

        situation = (
            f"{len(flooded)} districts at flood depth with {at_risk:,} people at risk; "
            f"transport remains viable on high ground. "
            + ("Critical infrastructure failures are compounding the surge." if severity else
               "No critical infrastructure failures this cycle.")
            + (f" HAZMAT zones active at {', '.join(contaminated)}." if contaminated else "")
        )
        plan = {
            "situation_read": situation,
            "directives": directives[:8],
            "watching": watching,
            "confidence": confidence,
        }
        return "\n".join(steps), plan


def _chunks(text: str, size: int = 7) -> list[str]:
    return [text[i : i + size] for i in range(0, len(text), size)]


class ReplayCommander:
    """Streams exact reasoning and plans from a previously captured trace file."""
    
    def __init__(self, trace_path: Path, token_delay_s: float = TOKEN_DELAY_S) -> None:
        self.delay = token_delay_s
        self.cycles: list[dict] = []
        if trace_path.exists():
            with open(trace_path, "r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip(): continue
                    try:
                        record = json.loads(line)
                        if record.get("type") == "cycle":
                            self.cycles.append(record)
                    except Exception:
                        pass

    async def stream(self, messages: list[dict]) -> AsyncIterator[StreamEvent]:
        # Determine which cycle we are on by looking at the prompt's Tick
        user = messages[-1]["content"]
        m = WORLD_STATE_RE.search(user)
        state = json.loads(m.group(1)) if m else {}
        tick = state.get("tick", 0)
        
        cycle_idx = (tick // 3) - 1
        cycle_idx = max(0, min(cycle_idx, len(self.cycles) - 1))
        
        record = self.cycles[cycle_idx] if self.cycles else {"reasoning": "No trace data available.", "plan": {"directives": [], "watching": [], "confidence": "low"}}
        
        reasoning = record.get("reasoning", "")
        plan = record.get("plan", {"directives": [], "watching": [], "confidence": "low"})
        
        for chunk in _chunks(reasoning, size=15):
            yield StreamEvent("reasoning", chunk)
            await asyncio.sleep(self.delay)
            
        content = "```json\n" + json.dumps(plan, indent=1) + "\n```"
        for chunk in _chunks(content, size=24):
            yield StreamEvent("content", chunk)
            await asyncio.sleep(self.delay / 2)
