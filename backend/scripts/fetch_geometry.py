"""Pull REAL geometry for the Kuttanad / Alappuzha map from OpenStreetMap.

Boundaries, Vembanad Lake, rivers and coastline as actual polylines, decimated
for the browser and written to the frontend so the map is drawn to scale from
real data, not a hand-drawn coastline. ODbL — OpenStreetMap contributors.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "geo"
OUT.mkdir(parents=True, exist_ok=True)
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]


def overpass(query: str) -> dict:
    for attempt in range(8):
        ep = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            data = urllib.parse.urlencode({"data": query}).encode()
            req = urllib.request.Request(ep, data=data)
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode())
        except Exception as e:  # rate limit / timeout
            print(f"  attempt {attempt+1} via {ep.split('/')[2]} failed ({e}); waiting…")
            time.sleep(12)
    raise RuntimeError("Overpass failed after retries")


def ways_to_lines(elements: list[dict]) -> list[list[list[float]]]:
    """Each way -> [[lon,lat], ...] (GeoJSON order)."""
    lines = []
    for el in elements:
        if el.get("type") == "way" and el.get("geometry"):
            lines.append([[round(p["lon"], 5), round(p["lat"], 5)] for p in el["geometry"]])
    return lines


def decimate(line: list[list[float]], tol: float = 0.0006) -> list[list[float]]:
    """Cheap point thinning: drop points closer than tol degrees, keep ends."""
    if len(line) <= 3:
        return line
    out = [line[0]]
    for p in line[1:-1]:
        lx, ly = out[-1]
        if abs(p[0] - lx) + abs(p[1] - ly) >= tol:
            out.append(p)
    out.append(line[-1])
    return out


def fetch_boundary(rel_id: int) -> list[list[list[float]]]:
    q = f"[out:json][timeout:80];relation({rel_id});out geom;"
    res = overpass(q)
    lines = []
    for el in res["elements"]:
        for m in el.get("members", []):
            if m.get("type") == "way" and m.get("geometry"):
                lines.append([[round(p["lon"], 5), round(p["lat"], 5)] for p in m["geometry"]])
    return [decimate(l) for l in lines]


def main() -> None:
    geo: dict[str, object] = {
        "_source": "OpenStreetMap contributors (ODbL) via Overpass API",
        "_about": "Real geometry for Kuttanad / Alappuzha, Kerala.",
    }

    print("district boundary (Alappuzha, rel 3743889)…")
    geo["alappuzha_district"] = fetch_boundary(3743889)
    time.sleep(3)

    print("taluk boundary (Kuttanad, rel 10124508)…")
    geo["kuttanad_taluk"] = fetch_boundary(10124508)
    time.sleep(3)

    print("Ambalappuzha taluk (rel 10124512)…")
    geo["ambalappuzha_taluk"] = fetch_boundary(10124512)
    time.sleep(3)

    bbox = "9.20,76.28,9.72,76.74"
    print("Vembanad Lake + backwaters…")
    water = overpass(f"""[out:json][timeout:80];
    (
      way["natural"="water"]({bbox});
      way["water"~"lake|lagoon"]({bbox});
    );
    out geom;""")
    # Keep only sizeable water bodies to stay small.
    lake_lines = [decimate(l) for l in ways_to_lines(water["elements"]) if len(l) > 8]
    geo["water"] = lake_lines
    time.sleep(3)

    print("rivers (Pamba, Achankovil, Manimala, Meenachil)…")
    rivers = overpass(f"""[out:json][timeout:80];
    way["waterway"="river"]({bbox});
    out geom;""")
    geo["rivers"] = [decimate(l) for l in ways_to_lines(rivers["elements"]) if len(l) > 4]
    time.sleep(3)

    print("coastline…")
    coast = overpass(f"""[out:json][timeout:80];
    way["natural"="coastline"](9.15,76.28,9.75,76.45);
    out geom;""")
    geo["coastline"] = [decimate(l) for l in ways_to_lines(coast["elements"])]

    path = OUT / "kuttanad_geo.json"
    path.write_text(json.dumps(geo, separators=(",", ":")))
    kb = path.stat().st_size / 1024
    counts = {k: len(v) for k, v in geo.items() if isinstance(v, list)}
    pts = {k: sum(len(l) for l in v) for k, v in geo.items() if isinstance(v, list)}
    print(f"\nwrote {path} ({kb:.0f} KB)")
    print("feature lines:", counts)
    print("total points:", pts)


if __name__ == "__main__":
    main()
