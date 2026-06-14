import { memo } from "react";
import type { City, Snapshot } from "../../types";
import { DashHeader, StatusPill } from "../Sidebar";

/* ═══════════════════════════════════════════════════════════════════
   ROADS DASHBOARD — Live road network status for evacuation planning.
   
   Designed for: Transport coordinator monitoring evacuation corridors.
   Shows: Every road segment with status, connected districts, and capacity.
   ═══════════════════════════════════════════════════════════════════ */

export const RoadsDash = memo(function RoadsDash({
  city,
  snapshot,
  onHover,
}: {
  city: City | null;
  snapshot: Snapshot | null;
  onHover: (id: string | null) => void;
}) {
  if (!city || !snapshot) {
    return (
      <div className="flex h-full flex-col">
        <DashHeader title="ROAD NETWORK" subtitle="Evacuation corridors" />
        <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--ink-dim)]">
          Awaiting data…
        </div>
      </div>
    );
  }

  const impassable = new Set(snapshot.impassable_edges);
  const destroyed = new Set(snapshot.destroyed_edges);
  const nodeMap = Object.fromEntries(city.nodes.map((n) => [n.id, n]));

  const roads = city.edges.map((e) => {
    const status = destroyed.has(e.id) ? "destroyed" : impassable.has(e.id) ? "blocked" : "open";
    return { ...e, status, aName: nodeMap[e.a]?.name ?? e.a, bName: nodeMap[e.b]?.name ?? e.b };
  }).sort((a, b) => {
    const order = { destroyed: 0, blocked: 1, open: 2 };
    return (order[a.status as keyof typeof order] ?? 2) - (order[b.status as keyof typeof order] ?? 2);
  });

  const openCount = roads.filter((r) => r.status === "open").length;
  const blockedCount = roads.filter((r) => r.status === "blocked").length;
  const destroyedCount = roads.filter((r) => r.status === "destroyed").length;
  const accessibility = Math.round((openCount / roads.length) * 100);

  return (
    <div className="flex h-full flex-col">
      <DashHeader title="ROAD NETWORK" subtitle="Evacuation corridors & route status"
        right={
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[var(--ink-dim)]">
              {accessibility}% accessible
            </span>
            <div className="h-1.5 w-[60px] rounded-full overflow-hidden" style={{ background: "rgba(140,160,200,0.08)" }}>
              <div className="h-full rounded-full transition-all" style={{
                width: `${accessibility}%`,
                background: accessibility > 70 ? "var(--ok)" : accessibility > 40 ? "var(--danger)" : "var(--danger-hot)",
              }} />
            </div>
          </div>
        }
      />
      <div className="scroll-thin flex-1 overflow-y-auto">
        {/* Summary bar */}
        <div className="flex items-center gap-4 border-b border-[var(--hairline)] px-5 py-2.5">
          <Stat value={openCount} label="Open" color="var(--ok)" />
          <Stat value={blockedCount} label="Blocked" color="var(--danger)" />
          <Stat value={destroyedCount} label="Destroyed" color="var(--danger-hot)" />
        </div>

        {/* Road table */}
        <div className="px-5 py-3">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[8px] tracking-[0.18em] uppercase text-[var(--ink-faint)]">
                <th className="pb-2 font-medium">Route</th>
                <th className="pb-2 font-medium">From</th>
                <th className="pb-2 font-medium">To</th>
                <th className="pb-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {roads.map((r) => (
                <tr key={r.id}
                  className="border-t border-[var(--hairline)] transition-colors hover:bg-[rgba(140,160,200,0.04)]"
                  onMouseEnter={() => onHover(r.a)}
                  onMouseLeave={() => onHover(null)}>
                  <td className="py-2 text-[11px] text-[var(--ink-dim)] mono">
                    {r.name || r.id.replace(/^e_/, "").replace(/_/g, " ")}
                  </td>
                  <td className="py-2 text-[11px] text-[var(--ink)]">{r.aName}</td>
                  <td className="py-2 text-[11px] text-[var(--ink)]">{r.bName}</td>
                  <td className="py-2 text-right"><StatusPill status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="display text-[16px] font-bold tabular-nums" style={{ color }}>{value}</span>
      <span className="text-[9px] text-[var(--ink-dim)]">{label}</span>
    </div>
  );
}
