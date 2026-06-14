import { memo } from "react";
import type { City, CityNode, NodeState, Snapshot } from "../../types";
import { DashHeader, MetricCard, ProgressBar, StatusPill } from "../Sidebar";

const DD_UNIT_PATHS: Record<string, string> = {
  bus: "M4 6h16v10H4zM4 12h16M8 18a1 1 0 100-2 1 1 0 000 2M16 18a1 1 0 100-2 1 1 0 000 2",
  boat: "M3 14l2 5h14l2-5zM12 14V4l6 5z",
  ambulance: "M3 8h13v8H3zM16 11h3l2 3v2h-5zM8 10v4M6 12h4",
  rescue_team: "M12 4a8 8 0 100 16 8 8 0 000-16zM12 9a3 3 0 100 6 3 3 0 000-6z",
};
function UnitSvg({ type }: { type: string }) {
  return (
    <span className="text-[var(--ink-dim)]">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={DD_UNIT_PATHS[type] ?? "M4 7h16v10H4z"} /></svg>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DISTRICT DASHBOARD — Deep analytics for a single district.
   
   Designed for: Area commander focusing on a specific neighborhood.
   Triggered by clicking a district on the map.
   ═══════════════════════════════════════════════════════════════════ */

export const DistrictDash = memo(function DistrictDash({
  city,
  snapshot,
  selectedDistrict,
  onSelectDistrict,
}: {
  city: City | null;
  snapshot: Snapshot | null;
  selectedDistrict: string | null;
  onSelectDistrict: (id: string | null) => void;
}) {
  if (!city || !snapshot) {
    return (
      <div className="flex h-full flex-col">
        <DashHeader title="TOWN DETAIL" subtitle="Select a town on the map" />
        <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--ink-dim)]">
          Awaiting data…
        </div>
      </div>
    );
  }

  const nodeMap = Object.fromEntries(city.nodes.map((n) => [n.id, n]));
  const stateMap = Object.fromEntries(snapshot.nodes.map((n) => [n.id, n]));
  const impassable = new Set(snapshot.impassable_edges);
  const destroyed = new Set(snapshot.destroyed_edges);

  const node = selectedDistrict ? nodeMap[selectedDistrict] : null;
  const state = selectedDistrict ? stateMap[selectedDistrict] : null;

  if (!node || !state) {
    return (
      <div className="flex h-full flex-col">
        <DashHeader title="TOWN DETAIL" subtitle="Click a town on the map"
          right={
            <select
              className="rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)] px-2 py-1 text-[10px] text-[var(--ink)]"
              value={selectedDistrict ?? ""}
              onChange={(e) => onSelectDistrict(e.target.value || null)}>
              <option value="">Select town…</option>
              {city.nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          }
        />
        <div className="flex flex-1 flex-col items-center justify-center text-center px-8">
          <div className="mb-3 text-[var(--ink-faint)]"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
          <span className="label-caps mb-1">No Town Selected</span>
          <span className="text-[11px] text-[var(--ink-dim)] leading-relaxed">
            Click any town on the map or use the dropdown above to view detailed analytics.
          </span>
        </div>
      </div>
    );
  }

  // Find connected edges
  const connectedEdges = city.edges.filter((e) => e.a === node.id || e.b === node.id);
  const openRoutes = connectedEdges.filter((e) => !impassable.has(e.id) && !destroyed.has(e.id));
  
  // Find nearby units
  const nearbyUnits = snapshot.units.filter((u) => u.location === node.id);
  
  // 911 calls for this town
  const calls = snapshot.telemetry.calls_by_district[node.id] ?? 0;
  
  // Power status
  const hasPower = state.power;
  const isContaminated = state.contaminated;
  
  // Shelter info
  const shelterPct = node.shelter_capacity > 0 ? Math.round((state.shelter_occupancy / node.shelter_capacity) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <DashHeader title={node.name} subtitle={`Elevation ${node.elevation_m.toFixed(1)}m · Pop. ${node.population.toLocaleString()}`}
        right={
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)] px-2 py-1 text-[10px] text-[var(--ink)]"
              value={selectedDistrict ?? ""}
              onChange={(e) => onSelectDistrict(e.target.value || null)}>
              {city.nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <button onClick={() => onSelectDistrict(null)}
              className="text-[12px] text-[var(--ink-dim)] hover:text-[var(--ink)]"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
        }
      />
      <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
        {/* Status tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <StatusPill status={state.depth === "dry" ? "open" : state.depth} size="md" />
          {!hasPower && <StatusPill status="offline" size="md" />}
          {hasPower && <StatusPill status="online" size="md" />}
          {isContaminated && (
            <span className="pill px-2.5 py-1 text-[10px] font-bold bg-[rgba(220,38,38,0.12)] text-[var(--danger-hot)]">
              CONTAMINATED
            </span>
          )}
          {node.is_hospital && <span className="pill px-2.5 py-1 text-[10px] font-bold bg-[rgba(59,125,216,0.10)] text-[#5ba0e8]">HOSPITAL</span>}
          {node.is_shelter && <span className="pill px-2.5 py-1 text-[10px] font-bold bg-[rgba(22,163,74,0.10)] text-[var(--ok)]">SHELTER</span>}
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <MetricCard label="Water Depth" value={state.water_m.toFixed(2)} unit="m"
            color={state.water_m > 1 ? "var(--danger-hot)" : state.water_m > 0.3 ? "var(--water)" : "var(--ink-bright)"} />
          <MetricCard label="Present" value={state.pop_present.toLocaleString()}
            sub={`of ${node.population.toLocaleString()}`} />
          <MetricCard label="Awaiting Evac" value={state.evacuees_waiting.toLocaleString()}
            color={state.evacuees_waiting > 500 ? "var(--danger-hot)" : "var(--danger)"} />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <MetricCard label="911 Calls" value={calls} unit="/min" />
          <MetricCard label="Routes Open" value={`${openRoutes.length}/${connectedEdges.length}`}
            color={openRoutes.length === 0 ? "var(--danger-hot)" : "var(--ok)"} />
        </div>

        {/* Shelter occupancy */}
        {node.is_shelter && (
          <div className="mb-5">
            <div className="label-caps mb-2" style={{ fontSize: 8 }}>SHELTER OCCUPANCY</div>
            <div className="rounded-xl border border-[var(--hairline)] bg-[var(--bg-inset)] px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-[var(--ink)]">{state.shelter_occupancy} / {node.shelter_capacity}</span>
                <span className="mono text-[10px] font-bold" style={{
                  color: shelterPct > 90 ? "var(--danger-hot)" : shelterPct > 70 ? "var(--danger)" : "var(--ok)"
                }}>{shelterPct}%</span>
              </div>
              <ProgressBar value={shelterPct}
                color={shelterPct > 90 ? "var(--danger-hot)" : shelterPct > 70 ? "var(--danger)" : "var(--ok)"} height={6} />
            </div>
          </div>
        )}

        {/* Connected roads */}
        <div className="mb-5">
          <div className="label-caps mb-2" style={{ fontSize: 8 }}>CONNECTED ROADS</div>
          <div className="space-y-1.5">
            {connectedEdges.map((e) => {
              const other = e.a === node.id ? e.b : e.a;
              const status = destroyed.has(e.id) ? "destroyed" : impassable.has(e.id) ? "blocked" : "open";
              return (
                <div key={e.id} className="flex items-center gap-2 rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)] px-3 py-2">
                  <span className="text-[10px] text-[var(--ink)] flex-1">
                    → {nodeMap[other]?.name ?? other}
                  </span>
                  <StatusPill status={status} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Units present */}
        {nearbyUnits.length > 0 && (
          <div>
            <div className="label-caps mb-2" style={{ fontSize: 8 }}>UNITS ON SITE</div>
            <div className="space-y-1.5">
              {nearbyUnits.map((u) => (
                <div key={u.id} className="flex items-center gap-2 rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)] px-3 py-2">
                  <UnitSvg type={u.type} />
                  <span className="mono text-[10px] text-[var(--ink-dim)]">{u.id}</span>
                  <span className="flex-1" />
                  <span className="mono text-[9px] text-[var(--ink-dim)]">{u.passengers} pax</span>
                  <StatusPill status={u.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
