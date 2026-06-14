import { memo } from "react";
import type { City, Snapshot } from "../../types";
import { DashHeader, StatusPill } from "../Sidebar";

/* ═══════════════════════════════════════════════════════════════════
   RESOURCES DASHBOARD — All response units in one view.
   
   Designed for: Logistics coordinator managing fleet deployment.
   ═══════════════════════════════════════════════════════════════════ */

const UNIT_PATHS: Record<string, string> = {
  bus: 'M4 6h16v10H4zM4 12h16M8 18a1 1 0 100-2 1 1 0 000 2M16 18a1 1 0 100-2 1 1 0 000 2',
  boat: 'M3 14l2 5h14l2-5zM12 14V4l6 5z',
  ambulance: 'M3 8h13v8H3zM16 11h3l2 3v2h-5zM8 10v4M6 12h4',
  rescue_team: 'M12 4a8 8 0 100 16 8 8 0 000-16zM12 9a3 3 0 100 6 3 3 0 000-6z',
};

function UnitGlyph({ type }: { type: string }) {
  return (
    <span className="text-[var(--ink-dim)]">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={UNIT_PATHS[type] ?? "M4 7h16v10H4z"} />
      </svg>
    </span>
  );
}

export const ResourcesDash = memo(function ResourcesDash({
  city,
  snapshot,
  onHover,
}: {
  city: City | null;
  snapshot: Snapshot | null;
  onHover: (id: string | null) => void;
}) {
  if (!snapshot || !city) {
    return (
      <div className="flex h-full flex-col">
        <DashHeader title="RESOURCES" subtitle="Response unit fleet" />
        <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--ink-dim)]">
          Awaiting data…
        </div>
      </div>
    );
  }

  const nodeMap = Object.fromEntries(city.nodes.map((n) => [n.id, n]));
  const units = snapshot.units;
  const active = units.filter((u) => u.status !== "idle");
  const totalPax = units.reduce((s, u) => s + u.passengers, 0);
  const totalCap = units.reduce((s, u) => s + u.capacity, 0);
  const utilization = totalCap > 0 ? Math.round((totalPax / totalCap) * 100) : 0;

  // Group by type
  const byType = new Map<string, typeof units>();
  for (const u of units) {
    const arr = byType.get(u.type) ?? [];
    arr.push(u);
    byType.set(u.type, arr);
  }

  return (
    <div className="flex h-full flex-col">
      <DashHeader title="RESOURCES" subtitle="Response unit fleet & deployment"
        right={
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-[var(--ok)]">{active.length} active</span>
            <span className="text-[var(--ink-dim)]">{units.length - active.length} idle</span>
          </div>
        }
      />
      <div className="scroll-thin flex-1 overflow-y-auto">
        {/* Utilization summary */}
        <div className="flex items-center gap-4 border-b border-[var(--hairline)] px-5 py-3">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-[10px] text-[var(--ink-dim)]">Fleet Utilization</span>
            <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: "rgba(140,160,200,0.08)" }}>
              <div className="h-full rounded-full transition-all" style={{
                width: `${utilization}%`,
                background: utilization > 80 ? "var(--danger)" : "var(--ok)",
              }} />
            </div>
            <span className="mono text-[10px] font-bold text-[var(--ink)]">{utilization}%</span>
          </div>
          <div className="text-[10px] text-[var(--ink-dim)]">
            {totalPax} passengers / {totalCap} capacity
          </div>
        </div>

        {/* Grouped by type */}
        <div className="px-5 py-3 space-y-4">
          {Array.from(byType.entries()).map(([type, typeUnits]) => (
            <div key={type}>
              <div className="flex items-center gap-2 mb-2">
                <UnitGlyph type={type} />
                <span className="label-caps" style={{ fontSize: 9 }}>
                  {type.replace(/_/g, " ")}s — {typeUnits.length}
                </span>
              </div>
              <div className="space-y-1">
                {typeUnits.map((u) => (
                  <div key={u.id}
                    className="flex items-center gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)] px-3 py-2 transition-colors hover:border-[var(--brand-line)]"
                    onMouseEnter={() => onHover(u.location)}
                    onMouseLeave={() => onHover(null)}>
                    <span className="mono text-[10px] text-[var(--ink-dim)] w-[70px] truncate">{u.id}</span>
                    <span className="text-[10px] text-[var(--ink)] flex-1 truncate">
                      {nodeMap[u.location]?.name ?? u.location.replace(/_/g, " ")}
                    </span>
                    {u.passengers > 0 && (
                      <span className="mono text-[9px] text-[var(--brand)]">{u.passengers}/{u.capacity}</span>
                    )}
                    <StatusPill status={u.status} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
