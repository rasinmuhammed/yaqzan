"""Replace abstract edges with REAL road routes (OSRM over OSM).

For every district-to-district link we ask OSRM for the real driving route:
its geometry (drawn on the map), distance and duration. Links whose only road
detours far around the Vembanad backwaters are reclassified as ferry/boat-only
edges — which is how Kuttanad actually moves. Real durations drive the sim's
travel_ticks. OSRM public API; OSM/ODbL.
"""
from __future__ import annotations

import json
import math
import time
import urllib.request
from pathlib import Path

SCEN = Path(__file__).resolve().parents[1] / "app" / "sim" / "scenarios"
GEO = Path(__file__).resolve().parents[2] / "frontend" / "public" / "geo"
GEO.mkdir(parents=True, exist_ok=True)
SCENARIOS = ["kuttanad_monsoon.json", "pamba_dam_release.json"]

MIN_PER_TICK = 6.0          # one sim tick ~ 6 minutes
FERRY_RATIO = 2.2           # road/straight beyond this => the real link is water
BOAT_KMH = 18.0             # rescue boat speed for ferry-edge timing


def haversine_km(a, b) -> float:
    r = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def osrm(a, b) -> dict | None:
    """a, b are (lat, lon). Returns {distance_km, duration_min, coords[[lat,lon]]}."""
    url = (f"https://router.project-osrm.org/route/v1/driving/"
           f"{a[1]},{a[0]};{b[1]},{b[0]}?overview=full&geometries=geojson")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                d = json.loads(r.read().decode())
            if d.get("code") == "Ok" and d.get("routes"):
                rt = d["routes"][0]
                coords = [[c[1], c[0]] for c in rt["geometry"]["coordinates"]]
                return {"distance_km": rt["distance"] / 1000,
                        "duration_min": rt["duration"] / 60, "coords": coords}
            return None
        except Exception as e:
            print(f"    OSRM retry ({e})"); time.sleep(4)
    return None


def main() -> None:
    # Edge set is shared across scenarios; resolve each unique (a,b) once.
    base = json.loads((SCEN / SCENARIOS[0]).read_text())
    coord = {n["id"]: (n["lat"], n["lon"]) for n in base["nodes"]}
    edges = {(e["a"], e["b"]) for e in base["edges"]}

    resolved: dict[tuple[str, str], dict] = {}
    roads_geo: dict[str, dict] = {}
    n_road = n_ferry = 0
    for i, (a, b) in enumerate(sorted(edges)):
        ca, cb = coord[a], coord[b]
        straight = haversine_km(ca, cb)
        route = osrm(ca, cb)
        time.sleep(0.4)
        if route and straight > 0 and route["distance_km"] / straight <= FERRY_RATIO:
            mode = "road"
            dist, dur, coords = route["distance_km"], route["duration_min"], route["coords"]
            n_road += 1
        else:
            mode = "ferry"
            dist = round(straight, 2)
            dur = straight / BOAT_KMH * 60
            coords = [list(ca), list(cb)]
            n_ferry += 1
        ticks = max(1, round(dur / MIN_PER_TICK))
        resolved[(a, b)] = {"mode": mode, "distance_km": round(dist, 2),
                            "duration_min": round(dur, 1), "travel_ticks": ticks}
        roads_geo[f"e_{a}_{b}"] = {"mode": mode, "coords": coords}
        print(f"  [{i+1}/{len(edges)}] {a}->{b}: {mode} {dist:.1f}km {dur:.0f}min t{ticks}")

    # Enrich every scenario's edges with the real values.
    for s in SCENARIOS:
        p = SCEN / s
        data = json.loads(p.read_text())
        for e in data["edges"]:
            r = resolved.get((e["a"], e["b"]))
            if r:
                e.update(r)
        p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    (GEO / "roads.json").write_text(json.dumps(roads_geo, separators=(",", ":")))
    print(f"\nroad {n_road} | ferry {n_ferry} | wrote roads.json "
          f"({(GEO / 'roads.json').stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
