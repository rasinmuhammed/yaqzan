import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap,
} from "react-leaflet";
import type { IntakeItem } from "../store";
import type { City, CityEdge, CityNode, NodeState, Snapshot, Unit } from "../types";

interface Dem { bounds: [number, number, number, number]; ncols: number; nrows: number; step: number; elev: number[]; }

/* ── Continuous, terrain-driven flood surface ──────────────────────────
   Real SRTM 30 m elevation (dem.json) decides where water pools; the sim's
   per-district water depth is interpolated across the grid and clipped to
   the low-lying terrain. Rendered to a small offscreen raster and scaled up
   with smoothing, so it reads as an organic flood, not boxes. */
function FloodHeatmap({ dem, nodes, stateById }: {
  dem: Dem | null;
  nodes: CityNode[];
  stateById: Record<string, NodeState>;
}) {
  const map = useMap();
  const overlayRef = useRef<L.ImageOverlay | null>(null);

  // A geographic ImageOverlay stays perfectly registered to the map through
  // any zoom/pan — Leaflet owns the projection, we just supply the raster.
  const stamp = nodes.map((n) => stateById[n.id]?.water_m ?? 0).join(",");
  useEffect(() => {
    if (!dem) return;
    const { ncols, nrows, step, bounds, elev } = dem;
    const [W, S, E, N] = bounds;
    const pts = nodes
      .filter((n) => typeof n.lat === "number")
      .map((n) => ({ lat: n.lat as number, lon: n.lon as number, w: stateById[n.id]?.water_m ?? 0 }));

    const off = document.createElement("canvas");
    off.width = ncols; off.height = nrows;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(ncols, nrows);
    for (let r = 0; r < nrows; r++) {
      const lat = N - r * step;
      for (let c = 0; c < ncols; c++) {
        const lon = W + c * step;
        let num = 0, den = 0, minD2 = Infinity;
        for (const p of pts) {
          const dlat = lat - p.lat, dlon = lon - p.lon;
          const d2 = dlat * dlat + dlon * dlon + 1e-6;
          if (d2 < minD2) minD2 = d2;
          const wgt = 1 / (d2 * d2);
          num += wgt * p.w; den += wgt;
        }
        const water = den > 0 ? num / den : 0;
        const e = elev[r * ncols + c];
        const terrain = e <= 2 ? 1 : e >= 16 ? 0 : (16 - e) / 14; // low land holds water
        // Fade out away from the districts so the flood follows the real
        // geography, not the rectangular DEM tile (no square edge).
        const R = 0.022; // ~2.4 km influence radius
        const coverage = Math.exp(-minD2 / (R * R));
        const [cr, cg, cb, ca] = floodRGBA(water * terrain * coverage);
        const i = (r * ncols + c) * 4;
        img.data[i] = cr; img.data[i + 1] = cg; img.data[i + 2] = cb; img.data[i + 3] = ca;
      }
    }
    ctx.putImageData(img, 0, 0);
    const url = off.toDataURL();
    const llBounds = L.latLngBounds([S, W], [N, E]);

    if (!map.getPane("flood")) {
      const pane = map.createPane("flood");
      pane.style.zIndex = "350";
      pane.style.pointerEvents = "none";
    }
    if (!overlayRef.current) {
      overlayRef.current = L.imageOverlay(url, llBounds, {
        opacity: 0.78, interactive: false, pane: "flood", className: "flood-overlay",
      }).addTo(map);
    } else {
      overlayRef.current.setUrl(url);
    }
  }, [dem, stamp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { overlayRef.current?.remove(); overlayRef.current = null; }, []);
  return null;
}

function floodRGBA(depth: number): [number, number, number, number] {
  if (depth < 0.12) return [0, 0, 0, 0];
  if (depth < 0.5) { const t = (depth - 0.12) / 0.38; return [56, 189, 248, 70 + t * 60]; }
  if (depth < 1.2) { const t = (depth - 0.5) / 0.7; return [37, 110, 230, 130 + t * 40]; }
  const t = Math.min(1, (depth - 1.2) / 1.6); return [26, 70, 200, 170 + t * 40];
}

/* ═══════════════════════════════════════════════════════════════════
   MAP PANEL — a real map of Kuttanad, Alappuzha (Kerala).

   The basemap is genuine OpenStreetMap data (CARTO dark tiles); districts
   sit at their true OSM lat/lon. The simulation — flood depth, blocked
   roads, rescue units, relief camps — is overlaid on the real geography.
   This is the actual place, not a diagram.
   ═══════════════════════════════════════════════════════════════════ */

interface Props {
  city: City;
  snapshot: Snapshot | null;
  hovered: string | null;
  onHover: (id: string | null) => void;
  intake: IntakeItem[];
  onDistrictClick?: (id: string) => void;
}

// Flood depth → water colour (realistic blues, deepening with depth).
function floodColor(depth: NodeState["depth"] | undefined): string {
  switch (depth) {
    case "severe": return "#1d4ed8";
    case "flooded": return "#2563eb";
    case "ponding": return "#38bdf8";
    default: return "#64748b";
  }
}

function accentColor(n: CityNode, st: NodeState | undefined): string {
  if (st?.contaminated) return "#ef4444";
  if (n.is_hospital) return "#f87171";
  if (n.is_shelter) return "#34d399";
  if (n.is_pump_station) return "#fbbf24";
  return "rgba(226,232,240,0.55)";
}

function nodeRadius(n: CityNode): number {
  return Math.max(6, Math.min(20, 5 + Math.sqrt(n.population) / 22));
}

// Clean stroke icons (no emoji) rendered into a coloured pin per unit type.
const UNIT_ICON: Record<Unit["type"], { color: string; svg: string }> = {
  boat: { color: "#38bdf8", svg: '<path d="M3 14l2 5h14l2-5z"/><path d="M12 14V4l6 5z"/>' },
  bus: { color: "#a78bfa", svg: '<rect x="4" y="6" width="16" height="10" rx="2"/><path d="M4 12h16"/><circle cx="8" cy="18" r="1.1"/><circle cx="16" cy="18" r="1.1"/>' },
  ambulance: { color: "#f87171", svg: '<rect x="3" y="8" width="13" height="8" rx="1"/><path d="M16 11h3l2 3v2h-5z"/><path d="M8 10v4M6 12h4"/><circle cx="8" cy="18" r="1"/><circle cx="17" cy="18" r="1"/>' },
  rescue_team: { color: "#fbbf24", svg: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>' },
};

function unitIcon(u: Unit, moving: boolean) {
  const { color, svg } = UNIT_ICON[u.type];
  const sz = moving ? 19 : 16;
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:${sz}px;height:${sz}px;border-radius:50%;background:rgba(10,14,20,0.85);border:1.5px solid ${color};box-shadow:0 1px 4px rgba(0,0,0,0.55)">`
      + `<svg width="${sz - 7}" height="${sz - 7}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg}</svg></div>`,
    iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
  });
}

/** Interpolate a [lat,lon] point at fraction t (0..1) along a polyline,
 *  weighted by real segment length, so vehicles follow the road's shape. */
function pointAlong(coords: [number, number][], t: number): [number, number] {
  if (!coords || coords.length === 0) return [0, 0];
  if (coords.length === 1) return coords[0];
  const clamped = Math.max(0, Math.min(1, t));
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    segs.push(d); total += d;
  }
  let target = clamped * total, acc = 0;
  for (let i = 0; i < segs.length; i++) {
    if (acc + segs[i] >= target) {
      const f = segs[i] ? (target - acc) / segs[i] : 0;
      return [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * f,
              coords[i][1] + (coords[i + 1][1] - coords[i][1]) * f];
    }
    acc += segs[i];
  }
  return coords[coords.length - 1];
}

/** Fit the map to the district set once, on mount. */
function FitToNodes({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export const MapPanel = memo(function MapPanel({
  city, snapshot, hovered, onHover, onDistrictClick,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [geo, setGeo] = useState<{ rivers?: number[][][]; boundary?: number[][][] } | null>(null);
  // Real road geometry per edge: { edge_id: { mode, coords:[[lat,lon]] } }
  const [roads, setRoads] = useState<Record<string, { mode: string; coords: [number, number][] }> | null>(null);
  const [dem, setDem] = useState<Dem | null>(null);
  const [institutions, setInstitutions] = useState<{ lat: number; lon: number; name: string; kind: string }[]>([]);
  const [transport, setTransport] = useState<{
    ferry_routes: [number, number][][];
    jetties: { lat: number; lon: number; name: string }[];
    bus_stations: { lat: number; lon: number; name: string }[];
  } | null>(null);

  // Real district/river outlines, if the geometry file has been fetched.
  useEffect(() => {
    let alive = true;
    fetch("/geo/kuttanad_geo.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => {
        if (!alive || !g) return;
        setGeo({ rivers: g.rivers, boundary: g.kuttanad_taluk ?? g.alappuzha_district });
      })
      .catch(() => {});
    fetch("/geo/roads.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((r) => { if (alive && r) setRoads(r); })
      .catch(() => {});
    fetch("/geo/dem.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setDem(d); })
      .catch(() => {});
    fetch("/geo/institutions.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => { if (alive && x) setInstitutions(x); })
      .catch(() => {});
    fetch("/geo/transport.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => { if (alive && x) setTransport(x); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const located = useMemo(
    () => city.nodes.filter((n) => typeof n.lat === "number" && typeof n.lon === "number"),
    [city.nodes]
  );
  const latlng = useMemo(() => {
    const m: Record<string, [number, number]> = {};
    for (const n of located) m[n.id] = [n.lat as number, n.lon as number];
    return m;
  }, [located]);
  const pts = useMemo(() => located.map((n) => [n.lat, n.lon] as [number, number]), [located]);

  const stateById = useMemo(() => {
    const m: Record<string, NodeState> = {};
    for (const s of snapshot?.nodes ?? []) m[s.id] = s;
    return m;
  }, [snapshot]);

  const impassable = useMemo(
    () => new Set([...(snapshot?.impassable_edges ?? []), ...(snapshot?.destroyed_edges ?? [])]),
    [snapshot]
  );
  const destroyed = useMemo(() => new Set(snapshot?.destroyed_edges ?? []), [snapshot]);

  const edgeById = useMemo(() => {
    const m: Record<string, CityEdge> = {};
    for (const e of city.edges) m[e.id] = e;
    return m;
  }, [city.edges]);

  if (located.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-[var(--ink-dim)]">
        Loading real map data…
      </div>
    );
  }

  const center: [number, number] = [9.42, 76.45];

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <MapContainer
        center={center}
        zoom={11}
        zoomControl={false}
        attributionControl
        className="h-full w-full"
        style={{ background: "#0a0e14" }}
        preferCanvas
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />
        <FitToNodes pts={pts} />
        <FloodHeatmap dem={dem} nodes={located} stateById={stateById} />

        {/* Real river courses (OSM), drawn under the simulation. */}
        {geo?.rivers?.map((line, i) => (
          <Polyline key={`r-${i}`} positions={line.map(([lo, la]) => [la, lo] as [number, number])}
            pathOptions={{ color: "#1e6091", weight: 1.4, opacity: 0.5 }} />
        ))}
        {geo?.boundary?.map((line, i) => (
          <Polyline key={`b-${i}`} positions={line.map(([lo, la]) => [la, lo] as [number, number])}
            pathOptions={{ color: "#f5821f", weight: 1.2, opacity: 0.45, dashArray: "4 4" }} />
        ))}

        {/* Real public-transport network (OSM): KSWTD ferry routes + terminals */}
        {transport?.ferry_routes?.map((line, i) => (
          <Polyline key={`fr-${i}`} positions={line}
            pathOptions={{ color: "#22d3ee", weight: 1.3, opacity: 0.4, dashArray: "1 5" }} />
        ))}
        {transport?.jetties?.map((j, i) => (
          <Marker key={`jetty-${i}`} position={[j.lat, j.lon]} pane="markerPane"
            icon={L.divIcon({ className: "", iconSize: [7, 7], iconAnchor: [3.5, 3.5],
              html: `<div style="width:6px;height:6px;background:#22d3ee;border:1px solid #0a0e14;transform:rotate(45deg)"></div>` })}>
            <Tooltip direction="top" className="yaqzan-tip">
              <span className="text-[9px] text-[var(--ink)]">{j.name} · ferry jetty</span>
            </Tooltip>
          </Marker>
        ))}
        {transport?.bus_stations?.map((b, i) => (
          <Marker key={`bus-${i}`} position={[b.lat, b.lon]} pane="markerPane"
            icon={L.divIcon({ className: "", iconSize: [7, 7], iconAnchor: [3.5, 3.5],
              html: `<div style="width:6px;height:6px;border-radius:1px;background:#a78bfa;border:1px solid #0a0e14"></div>` })}>
            <Tooltip direction="top" className="yaqzan-tip">
              <span className="text-[9px] text-[var(--ink)]">{b.name} · bus station</span>
            </Tooltip>
          </Marker>
        ))}

        {/* Real road network (OSRM geometry); ferry links shown dashed */}
        {city.edges.map((e) => {
          const real = roads?.[e.id];
          const a = latlng[e.a], b = latlng[e.b];
          const path = real?.coords ?? (a && b ? [a, b] : null);
          if (!path) return null;
          const blocked = impassable.has(e.id);
          const gone = destroyed.has(e.id);
          const ferry = (real?.mode ?? e.mode) === "ferry";
          return (
            <Polyline key={e.id} positions={path}
              pathOptions={{
                color: gone ? "#7f1d1d" : blocked ? "#ef4444" : ferry ? "#0e7490" : "#64748b",
                weight: blocked ? 2.5 : ferry ? 1.5 : 1.8,
                opacity: gone ? 0.5 : blocked ? 0.85 : 0.6,
                dashArray: gone || blocked ? "3 5" : ferry ? "2 6" : undefined,
              }} />
          );
        })}

        {/* Real institutions (OSM): actual named hospitals on the map */}
        {institutions.map((p, i) => {
          const icon = L.divIcon({
            className: "",
            html: `<div style="width:9px;height:9px;border-radius:50%;background:rgba(248,113,113,0.85);border:1px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.6)"></div>`,
            iconSize: [9, 9], iconAnchor: [4.5, 4.5],
          });
          return (
            <Marker key={`inst-${i}`} position={[p.lat, p.lon]} icon={icon} pane="markerPane">
              <Tooltip direction="top" offset={[0, -2]} className="yaqzan-tip">
                <div className="text-[10px] font-semibold text-[var(--ink-bright)]">{p.name}</div>
                <div className="text-[8px] text-[var(--ink-faint)]">Real hospital · OpenStreetMap</div>
              </Tooltip>
            </Marker>
          );
        })}

        {/* Districts */}
        {located.map((n) => {
          const st = stateById[n.id];
          const isHot = hovered === n.id || selected === n.id;
          return (
            <CircleMarker key={n.id} center={latlng[n.id]}
              radius={nodeRadius(n) * (isHot ? 1.3 : 1)}
              pathOptions={{
                color: accentColor(n, st),
                weight: isHot ? 2.5 : 1.5,
                fillColor: floodColor(st?.depth),
                fillOpacity: 0.85,
                dashArray: st?.contaminated ? "3 3" : undefined,
              }}
              eventHandlers={{
                mouseover: () => onHover(n.id),
                mouseout: () => onHover(null),
                click: () => { setSelected(n.id); onDistrictClick?.(n.id); },
              }}>
              <Tooltip direction="top" offset={[0, -4]} opacity={1} className="yaqzan-tip">
                <DistrictTip n={n} st={st} />
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* Rescue units: moving ones glide along the real road/ferry geometry,
            stationary ones fan out around their district. */}
        {(() => {
          const us = snapshot?.units ?? [];
          const atNode: Record<string, Unit[]> = {};
          const moving: { u: Unit; pos: [number, number]; coords: [number, number][] }[] = [];
          for (const u of us) {
            const road = u.current_edge ? roads?.[u.current_edge] : null;
            const edge = u.current_edge ? edgeById[u.current_edge] : null;
            if (u.status === "moving" && road && edge && typeof u.progress === "number") {
              const t = u.location === edge.a ? u.progress : 1 - u.progress;
              moving.push({ u, pos: pointAlong(road.coords, t), coords: road.coords });
            } else {
              (atNode[u.location] ??= []).push(u);
            }
          }
          const els: JSX.Element[] = [];
          // Highlight the road each moving unit is travelling.
          for (const m of moving) {
            els.push(<Polyline key={`route-${m.u.id}`} positions={m.coords}
              pathOptions={{ color: "var(--brand)", weight: 2.4, opacity: 0.55 }} />);
          }
          for (const m of moving) {
            els.push(<Marker key={m.u.id} position={m.pos} icon={unitIcon(m.u, true)} pane="markerPane"
              title={`${m.u.id} (${m.u.type}) — moving · ${Math.round((m.u.progress ?? 0) * 100)}% along ${m.u.current_edge?.replace("e_", "")}`} />);
          }
          for (const [nid, group] of Object.entries(atNode)) {
            const base = latlng[nid];
            if (!base) continue;
            group.forEach((u, i) => {
              const ang = (i / Math.max(1, group.length)) * Math.PI * 2;
              const pos: [number, number] = group.length > 1
                ? [base[0] + Math.cos(ang) * 0.005, base[1] + Math.sin(ang) * 0.005] : base;
              els.push(<Marker key={u.id} position={pos} icon={unitIcon(u, false)} pane="markerPane"
                title={`${u.id} (${u.type}) — ${u.status}`} />);
            });
          }
          return els;
        })()}
      </MapContainer>

      {/* SIMULATION badge */}
      <div className="pointer-events-none absolute left-3 top-3 z-[500] flex items-center gap-2">
        <span className="rounded-md border border-[var(--brand-line)] bg-[rgba(10,14,20,0.85)] px-2 py-1 text-[9px] font-bold tracking-[0.15em] text-[var(--brand)]">
          SIMULATION · KUTTANAD, ALAPPUZHA
        </span>
        {snapshot && (
          <span className="rounded-md bg-[rgba(10,14,20,0.85)] px-2 py-1 text-[9px] text-[var(--ink-dim)]">
            t{snapshot.tick} · {snapshot.severity_level.toUpperCase()}
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-6 left-3 z-[500] rounded-lg border border-[var(--hairline)] bg-[rgba(10,14,20,0.82)] px-3 py-2 text-[9px] text-[var(--ink-dim)]">
        <div className="mb-1 flex items-center gap-3">
          <Dot c="#1d4ed8" /> severe
          <Dot c="#2563eb" /> flooded
          <Dot c="#38bdf8" /> ponding
        </div>
        <div className="flex items-center gap-3">
          <Ring c="#34d399" /> relief camp
          <Ring c="#f87171" /> hospital
          <Ring c="#fbbf24" /> pump
        </div>
        <div className="mt-1 text-[8px] text-[var(--ink-faint)]">
          Basemap: OpenStreetMap, CARTO · towns at real coordinates
        </div>
      </div>
    </div>
  );
});

function Dot({ c }: { c: string }) {
  return <span className="inline-block h-[7px] w-[7px] rounded-full align-middle" style={{ background: c }} />;
}
function Ring({ c }: { c: string }) {
  return <span className="inline-block h-[7px] w-[7px] rounded-full align-middle"
    style={{ border: `1.5px solid ${c}` }} />;
}

function DistrictTip({ n, st }: { n: CityNode; st: NodeState | undefined }) {
  const o = n.osm ?? {};
  return (
    <div className="min-w-[150px]">
      <div className="text-[11px] font-bold text-[var(--ink-bright)]">{n.name}</div>
      <div className="text-[9px] text-[var(--ink-dim)]">
        elev {n.elevation_m}m · pop {n.population.toLocaleString()}
        {n.elevation_m < 0 && " · below sea level"}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
        <span>Water: <b style={{ color: floodColor(st?.depth) }}>{(st?.water_m ?? 0).toFixed(2)}m</b></span>
        <span>Power: <b>{st?.power === false ? "out" : "on"}</b></span>
        <span>Present: <b>{(st?.pop_present ?? n.population).toLocaleString()}</b></span>
        {n.is_shelter && <span>Camp: <b>{n.shelter_capacity.toLocaleString()}</b></span>}
      </div>
      {(o.hospitals || o.schools) && (
        <div className="mt-1 border-t border-[var(--hairline)] pt-1 text-[8.5px] text-[var(--ink-faint)]">
          {o.hospitals ? `${o.hospitals} hospitals` : ""}{o.hospitals && o.schools ? " · " : ""}
          {o.schools ? `${o.schools} schools` : ""} (OSM)
          {o.hospital_names?.[0] && <div className="truncate">e.g. {o.hospital_names[0]}</div>}
        </div>
      )}
    </div>
  );
}
