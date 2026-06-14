"""Sample the real SRTM 30 m elevation tile into a grid for the flood heatmap.

Reads NASA SRTMGL1 (N09E076.hgt, 3601x3601 int16, lat 9..10 / lon 76..77) and
samples a regular grid across the whole Kuttanad operational area. The frontend
uses this real terrain to render a continuous, terrain-following flood surface
(low polders flood first) instead of discrete markers. Public domain (NASA).
"""
from __future__ import annotations

import array
import json
from pathlib import Path

HGT = Path(__file__).resolve().parents[1] / "data" / "dem" / "N09E076.hgt"
OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "geo" / "dem.json"

TILE_LAT0, TILE_LON0 = 9.0, 76.0   # SW corner of the tile
SAMPLES = 3601                      # 1 arc-second
SPP = SAMPLES - 1                   # samples per degree (3600)

# Operational bbox covering all districts with margin.
W, S, E, N = 76.30, 9.235, 76.70, 9.700
STEP = 0.0025                       # ~280 m cells


def load_tile() -> array.array:
    raw = HGT.read_bytes()
    a = array.array("h")            # signed short
    a.frombytes(raw)
    a.byteswap()                    # .hgt is big-endian
    return a


def elev_at(tile: array.array, lat: float, lon: float) -> int:
    row = round((TILE_LAT0 + 1 - lat) * SPP)   # row 0 = north (lat 10)
    col = round((lon - TILE_LON0) * SPP)
    row = min(max(row, 0), SAMPLES - 1)
    col = min(max(col, 0), SAMPLES - 1)
    v = tile[row * SAMPLES + col]
    if v < -1000:                   # SRTM void
        return 0
    return v


def main() -> None:
    tile = load_tile()
    ncols = round((E - W) / STEP)
    nrows = round((N - S) / STEP)
    elev: list[int] = []
    lo = hi = 0
    for r in range(nrows):
        lat = N - r * STEP          # row 0 = north
        for c in range(ncols):
            lon = W + c * STEP
            e = elev_at(tile, lat, lon)
            elev.append(e)
            lo = min(lo, e); hi = max(hi, e)
    OUT.write_text(json.dumps({
        "_source": "NASA SRTM 30 m (SRTMGL1), public domain",
        "bounds": [W, S, E, N],     # lon/lat
        "ncols": ncols, "nrows": nrows, "step": STEP,
        "elev": elev,               # row-major, north-to-south
    }, separators=(",", ":")))
    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.name}: {ncols}x{nrows} = {len(elev)} cells, "
          f"elev {lo}..{hi} m, {kb:.0f} KB")


if __name__ == "__main__":
    main()
