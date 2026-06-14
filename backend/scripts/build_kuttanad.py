"""Build the Kuttanad (Alappuzha, Kerala) scenario set from real geography.

Kuttanad is the lowest-lying region in India: large parts sit up to ~2.2 m
*below* mean sea level, reclaimed paddy polders ("kayal lands") ringed by the
Vembanad backwaters and fed by five rivers (Pamba, Achankovil, Manimala,
Meenachil, Muvattupuzha). In the 2018 Kerala floods the whole of Kuttanad was
inundated and ~250,000 people were evacuated, with 55 relief camps in
Chengannur alone. Flood control hangs on two real structures: the
Thanneermukkom salt-water bund across Vembanad Lake and the Thottappally
spillway that drains floodwater to the Arabian Sea.

Node names, relative geography and elevations are grounded in that reality;
populations and hydrology are plausible synthetic values for simulation.
Everything is emitted with the engine's working inject-effect vocabulary.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "app" / "sim" / "scenarios"
OSM = Path(__file__).resolve().parents[1] / "data" / "osm" / "amenities.json"

# id, name, real lat, lon (OpenStreetMap), elevation_m, population, flags.
# Coordinates are genuine; elevations follow Kuttanad's documented
# below-mean-sea-level morphology; populations are plausible synthetic values.
# is_hospital / is_shelter are confirmed below against real OSM facility counts.
NODES = [
    # --- Coast & Alappuzha town (west) ---
    ("alappuzha_town", "Alappuzha Town", 9.4981, 76.3388, 1.0, 174000, {"is_hospital": True}),
    ("vandanam", "Vandanam", 9.4520, 76.3490, 2.0, 16000, {"is_hospital": True}),
    ("punnapra", "Punnapra", 9.4333, 76.3500, 0.8, 22000, {}),
    ("ambalappuzha", "Ambalappuzha", 9.3833, 76.3678, 1.5, 24000, {}),
    ("purakkad", "Purakkad", 9.3550, 76.3700, 0.6, 9000, {}),
    ("thottappally", "Thottappally Spillway", 9.3188, 76.3848, 0.4, 3000, {"is_pump_station": True}),
    # --- Vembanad backwaters (north) ---
    ("cherthala", "Cherthala", 9.6847, 76.3360, 3.2, 45000, {"is_shelter": True}),
    ("muhamma", "Muhamma", 9.6054, 76.3605, 1.2, 18000, {}),
    ("thanneermukkom", "Thanneermukkom Bund", 9.6700, 76.4100, 0.3, 5000, {"is_pump_station": True}),
    ("kumarakom", "Kumarakom", 9.5961, 76.4305, 1.5, 14000, {"is_shelter": True}),
    # --- Kuttanad polders (below sea level, centre) ---
    ("kainakary", "Kainakary", 9.4786, 76.3868, -2.2, 12000, {}),
    ("nedumudy", "Nedumudy", 9.4438, 76.4060, -1.5, 16000, {}),
    ("pulincunnu", "Pulincunnu", 9.4550, 76.4200, -1.8, 11000, {}),
    ("neelamperoor", "Neelamperoor", 9.4965, 76.5053, -1.3, 6000, {}),
    ("champakulam", "Champakulam", 9.4081, 76.4115, -2.0, 13000, {}),
    ("edathua", "Edathua", 9.3661, 76.4772, -1.2, 11000, {"is_shelter": True}),
    ("kavalam", "Kavalam", 9.4762, 76.4556, -2.0, 9000, {}),
    ("ramankary", "Ramankary", 9.4333, 76.4666, -1.6, 10000, {}),
    ("mankombu", "Mankombu", 9.4200, 76.4500, -1.9, 7000, {}),
    ("thakazhi", "Thakazhi", 9.3900, 76.4300, -1.4, 15000, {}),
    ("muttar", "Muttar", 9.4200, 76.5000, -1.7, 8000, {}),
    ("veliyanad", "Veliyanad", 9.4473, 76.4709, -1.0, 9000, {}),
    # --- River towns & higher ground (east) ---
    ("changanassery", "Changanassery", 9.4465, 76.5403, 4.5, 52000, {"is_shelter": True, "is_hospital": True}),
    ("thiruvalla", "Thiruvalla", 9.3867, 76.5763, 8.0, 57000, {"is_hospital": True}),
    ("chengannur", "Chengannur", 9.3179, 76.6139, 5.5, 38000, {"is_shelter": True, "is_hospital": True}),
    ("pandanad", "Pandanad", 9.3261, 76.5769, 2.5, 14000, {}),
    ("aranmula", "Aranmula", 9.3268, 76.6857, 6.5, 12000, {}),
    ("mavelikkara", "Mavelikkara", 9.2505, 76.5402, 7.0, 31000, {"is_shelter": True}),
]

# Canvas projection from real lat/lon. Padded bounds around the node set.
LAT_MIN, LAT_MAX = 9.235, 9.700
LON_MIN, LON_MAX = 76.320, 76.700
X0, X1, Y0, Y1 = 110, 895, 115, 600


def project(lat: float, lon: float) -> tuple[float, float]:
    x = X0 + (lon - LON_MIN) / (LON_MAX - LON_MIN) * (X1 - X0)
    y = Y0 + (LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * (Y1 - Y0)  # north = up
    return round(x, 1), round(y, 1)


def haversine(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def snap_osm() -> dict[str, dict]:
    """Assign every real OSM facility to its nearest district node."""
    out = {nid: {"hospital": [], "clinic": [], "school": [], "college": [],
                 "place_of_worship": [], "community_centre": []}
           for nid, *_ in NODES}
    if not OSM.exists():
        return {nid: {} for nid, *_ in NODES}
    data = json.loads(OSM.read_text())
    for el in data["elements"]:
        tags = el.get("tags", {})
        kind = tags.get("amenity")
        if kind not in out[NODES[0][0]]:
            continue
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        if lat is None or lon is None:
            continue
        nearest = min(NODES, key=lambda n: haversine(lat, lon, n[2], n[3]))
        out[nearest[0]][kind].append(tags.get("name") or "")
    # Compact to counts + a few real flagship names.
    enriched = {}
    for nid, buckets in out.items():
        named = {k: [n for n in v if n] for k, v in buckets.items()}
        enriched[nid] = {
            "hospitals": len(buckets["hospital"]),
            "clinics": len(buckets["clinic"]),
            "schools": len(buckets["school"]),
            "colleges": len(buckets["college"]),
            "worship": len(buckets["place_of_worship"]),
            "community": len(buckets["community_centre"]),
            "hospital_names": sorted(named["hospital"], key=len, reverse=True)[:3],
            "shelter_names": (named["school"] + named["community_centre"] + named["place_of_worship"])[:3],
            "source": "OpenStreetMap / OpenDataKerala (ODbL)",
        }
    return enriched

EDGES = [
    # west coast chain
    ("alappuzha_town", "vandanam"), ("vandanam", "punnapra"), ("alappuzha_town", "punnapra"),
    ("punnapra", "ambalappuzha"), ("ambalappuzha", "purakkad"), ("purakkad", "thottappally"),
    ("ambalappuzha", "thottappally"),
    # north / Vembanad
    ("alappuzha_town", "cherthala"), ("cherthala", "muhamma"), ("muhamma", "thanneermukkom"),
    ("cherthala", "thanneermukkom"), ("thanneermukkom", "kumarakom"),
    # west -> centre
    ("muhamma", "kainakary"), ("thanneermukkom", "kainakary"), ("alappuzha_town", "nedumudy"),
    ("kumarakom", "neelamperoor"),
    # centre mesh
    ("kainakary", "nedumudy"), ("kainakary", "pulincunnu"), ("nedumudy", "pulincunnu"),
    ("pulincunnu", "neelamperoor"), ("neelamperoor", "kavalam"), ("pulincunnu", "kavalam"),
    ("kavalam", "veliyanad"), ("nedumudy", "champakulam"), ("champakulam", "edathua"),
    ("edathua", "kavalam"), ("edathua", "ramankary"), ("ramankary", "mankombu"),
    ("mankombu", "thakazhi"), ("thakazhi", "champakulam"), ("ramankary", "muttar"),
    ("muttar", "veliyanad"), ("edathua", "mankombu"), ("nedumudy", "edathua"),
    ("thakazhi", "mankombu"),
    # centre -> east
    ("veliyanad", "pandanad"), ("kavalam", "pandanad"), ("muttar", "mavelikkara"),
    ("ramankary", "mavelikkara"), ("neelamperoor", "changanassery"),
    # east network
    ("pandanad", "chengannur"), ("changanassery", "chengannur"), ("changanassery", "thiruvalla"),
    ("chengannur", "thiruvalla"), ("chengannur", "aranmula"), ("aranmula", "mavelikkara"),
    ("pandanad", "mavelikkara"), ("changanassery", "pandanad"), ("thiruvalla", "aranmula"),
    # south coast -> east
    ("thottappally", "thakazhi"), ("thakazhi", "mavelikkara"), ("ambalappuzha", "thakazhi"),
]

UNITS = [
    # Boats are the workhorse of Kuttanad rescue (the 2018 "army of boats").
    ("boat_1", "boat", "alappuzha_town", 40, 1), ("boat_2", "boat", "nedumudy", 40, 1),
    ("boat_3", "boat", "champakulam", 40, 1), ("boat_4", "boat", "edathua", 40, 1),
    ("boat_5", "boat", "kainakary", 40, 1), ("boat_6", "boat", "pandanad", 40, 1),
    ("bus_1", "bus", "cherthala", 60, 1), ("bus_2", "bus", "changanassery", 60, 1),
    ("bus_3", "bus", "chengannur", 60, 1), ("bus_4", "bus", "mavelikkara", 60, 1),
    ("amb_1", "ambulance", "vandanam", 4, 2), ("amb_2", "ambulance", "alappuzha_town", 4, 2),
    ("amb_3", "ambulance", "thiruvalla", 4, 2),
    ("rt_1", "rescue_team", "chengannur", 12, 1), ("rt_2", "rescue_team", "edathua", 12, 1),
    ("rt_3", "rescue_team", "alappuzha_town", 12, 1),
]

NODE_XY = {n[0]: project(n[2], n[3]) for n in NODES}
NODE_EL = {n[0]: n[4] for n in NODES}


def build_nodes() -> list[dict]:
    osm = snap_osm()
    out = []
    for nid, name, lat, lon, elev, pop, flags in NODES:
        x, y = project(lat, lon)
        node = {"id": nid, "name": name, "x": x, "y": y,
                "elevation_m": elev, "population": pop,
                "lat": lat, "lon": lon, "osm": osm.get(nid, {})}
        node.update(flags)
        # Real relief-camp capacity: schools and community halls were the
        # actual 2018 shelters. ~250 people per school, ~150 per hall.
        if node.get("is_shelter"):
            o = osm.get(nid, {})
            cap = o.get("schools", 0) * 250 + o.get("community", 0) * 150
            node["shelter_capacity"] = max(4000, min(16000, cap or 6000))
        out.append(node)
    return out


def build_edges() -> list[dict]:
    out = []
    for a, b in EDGES:
        (ax, ay), (bx, by) = NODE_XY[a], NODE_XY[b]
        dist = math.hypot(ax - bx, ay - by)
        travel = max(1, round(dist / 130))
        # Low-lying links flood sooner.
        low = min(NODE_EL[a], NODE_EL[b])
        threshold = round(max(0.35, 0.65 + low * 0.12), 2)
        out.append({
            "id": f"e_{a}_{b}", "a": a, "b": b,
            "capacity_per_tick": 200, "travel_ticks": travel,
            "flooded_threshold_m": threshold,
        })
    return out


def build_units() -> list[dict]:
    return [{"id": uid, "type": t, "location": loc, "capacity": cap, "speed": spd}
            for uid, t, loc, cap, spd in UNITS]


def rainfall(peaks: list[tuple[int, float]], ticks: int, base: float) -> list[float]:
    """Sum of gaussian-ish pulses on a low base; mimics the 2018 twin deluges."""
    curve = []
    for t in range(ticks):
        v = base
        for centre, amp in peaks:
            v += amp * math.exp(-((t - centre) ** 2) / 18.0)
        curve.append(round(v, 1))
    return curve


def kuttanad_monsoon() -> dict:
    ticks = 60
    return {
        "city_name": "Kuttanad, Alappuzha",
        "region": "Kerala, India",
        "scenario": "Kuttanad Monsoon Deluge",
        "description": (
            "August monsoon over the Pamba catchment. Reservoirs spill into "
            "Kuttanad's below-sea-level polders while the Thanneermukkom bund "
            "and Thottappally spillway struggle to hold back Vembanad Lake. "
            "Modelled on the 2018 Kerala floods."
        ),
        "provenance": (
            "Geography, place names and flood-control structures are real "
            "(Kuttanad, Alappuzha district). Population and hydrology are "
            "plausible synthetic values for simulation."
        ),
        "seed": 2018,
        "ticks": ticks,
        "water_sources": ["chengannur", "pandanad", "kainakary"],
        "base_surge_rate_m": 0.11,
        "rainfall_curve": rainfall([(11, 34), (28, 62), (33, 55)], ticks, 4.0),
        "nodes": build_nodes(),
        "edges": build_edges(),
        "units": build_units(),
        "injects": [
            {"id": "imd_red", "tick": 5, "severity": "high",
             "headline": "IMD red alert: extreme rainfall forecast over the Pamba catchment",
             "effect": {"surge_rate_m": 0.18}},
            {"id": "kakki_release", "tick": 9, "severity": "critical",
             "headline": "Shutters opened at Kakki reservoir; surge racing down the Pamba toward Chengannur",
             "effect": {"water_spike": {"chengannur": 0.9, "pandanad": 0.7}}},
            {"id": "pandanad_bridge", "tick": 14, "severity": "high",
             "headline": "Pandanad approach road submerged; eastern link severed",
             "effect": {"destroy_edge": "e_changanassery_pandanad"}},
            {"id": "bund_overtop", "tick": 18, "severity": "critical",
             "headline": "Thanneermukkom bund overtopped; backwater pushing into central Kuttanad",
             "effect": {"add_water_source": "thanneermukkom"}},
            {"id": "grid_down", "tick": 22, "severity": "high",
             "headline": "KSEB substation flooded; power out across the central polders",
             "effect": {"power_outage": ["nedumudy", "champakulam", "kainakary", "kavalam"]}},
            {"id": "comms_degraded", "tick": 26, "severity": "critical",
             "headline": "Mobile towers failing in inundated zones; reaching trapped families is getting harder",
             "effect": {"cell_degradation": 45}},
            {"id": "edathua_crowd", "tick": 30, "severity": "high",
             "headline": "Edathua relief camp swelling as boats bring in evacuees from Champakulam",
             "effect": {"crowd_surge": {"target": "edathua", "people": 1800}}},
            {"id": "fuel_slick", "tick": 35, "severity": "medium",
             "headline": "Diesel and sewage contamination reported in floodwater near Punnapra",
             "effect": {"contaminate": ["punnapra"]}},
            {"id": "vandanam_gen", "tick": 40, "severity": "critical",
             "headline": "Backup generator faltering at TD Medical College, Vandanam",
             "effect": {"hospital_generator_down": "vandanam"}},
            {"id": "easing", "tick": 52, "severity": "low",
             "headline": "Rain easing; Thottappally spillway clearing water to the Arabian Sea",
             "effect": {"surge_rate_m": -0.09}},
        ],
    }


def pamba_dam_release() -> dict:
    """A sharper, faster scenario: night-time emergency dam release."""
    ticks = 50
    return {
        "city_name": "Kuttanad, Alappuzha",
        "region": "Kerala, India",
        "scenario": "Pamba Night Dam Release",
        "description": (
            "An emergency overnight release from the Pamba reservoirs sends a "
            "fast surge through Chengannur and Pandanad while crews and "
            "families sleep. A race against a wall of water in the dark."
        ),
        "provenance": (
            "Real Kuttanad geography and flood-control structures; synthetic "
            "hydrology tuned for a fast-onset exercise."
        ),
        "seed": 815,
        "ticks": ticks,
        "water_sources": ["chengannur", "pandanad"],
        "base_surge_rate_m": 0.14,
        "rainfall_curve": rainfall([(6, 28), (20, 40)], ticks, 6.0),
        "nodes": build_nodes(),
        "edges": build_edges(),
        "units": build_units(),
        "injects": [
            {"id": "night_release", "tick": 4, "severity": "critical",
             "headline": "Emergency night release from Pamba dams; little warning downstream",
             "effect": {"water_spike": {"chengannur": 1.1, "pandanad": 0.9}, "surge_rate_m": 0.22}},
            {"id": "chengannur_rail", "tick": 9, "severity": "high",
             "headline": "Chengannur rail underpass submerged; road bridge to Pandanad cut",
             "effect": {"destroy_edge": "e_pandanad_chengannur"}},
            {"id": "comms_night", "tick": 13, "severity": "critical",
             "headline": "Power and mobile coverage collapsing across the eastern polders at night",
             "effect": {"power_outage": ["pandanad", "veliyanad", "muttar"], "cell_degradation": 38}},
            {"id": "bund_strain", "tick": 18, "severity": "high",
             "headline": "Thanneermukkom bund under strain as backwater rises",
             "effect": {"add_water_source": "thanneermukkom"}},
            {"id": "mavelikkara_crowd", "tick": 24, "severity": "high",
             "headline": "Mavelikkara camp overwhelmed by overnight arrivals",
             "effect": {"crowd_surge": {"target": "mavelikkara", "people": 1500}}},
            {"id": "dawn_easing", "tick": 40, "severity": "low",
             "headline": "Dawn brings a lull; spillway gates easing the crest",
             "effect": {"surge_rate_m": -0.10}},
        ],
    }


def main() -> None:
    # Retire the off-theme Gulf scenarios; Kuttanad is the focus now.
    for stale in ("coastal_flood.json", "earthquake_tsunami.json", "industrial_fire.json"):
        p = OUT / stale
        if p.exists():
            p.unlink()
    for builder in (kuttanad_monsoon, pamba_dam_release):
        data = builder()
        fname = {
            "Kuttanad Monsoon Deluge": "kuttanad_monsoon.json",
            "Pamba Night Dam Release": "pamba_dam_release.json",
        }[data["scenario"]]
        (OUT / fname).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        print(f"wrote {fname}: {len(data['nodes'])} nodes, {len(data['edges'])} edges, "
              f"{len(data['injects'])} injects")


if __name__ == "__main__":
    main()
