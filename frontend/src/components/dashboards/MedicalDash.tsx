import { memo } from "react";
import type { Snapshot } from "../../types";
import { DashHeader, MetricCard, ProgressBar, StatusPill } from "../Sidebar";

/* ═══════════════════════════════════════════════════════════════════
   MEDICAL DASHBOARD — Hospital & medical resource monitoring.
   
   Designed for: Medical coordinator managing patient flow & triage.
   ═══════════════════════════════════════════════════════════════════ */

export const MedicalDash = memo(function MedicalDash({
  snapshot,
}: {
  snapshot: Snapshot | null;
}) {
  if (!snapshot) {
    return (
      <div className="flex h-full flex-col">
        <DashHeader title="MEDICAL" subtitle="Hospital & triage status" />
        <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--ink-dim)]">
          Awaiting data…
        </div>
      </div>
    );
  }

  const tel = snapshot.telemetry;
  const ambulances = snapshot.units.filter((u) => u.type === "ambulance");
  const totalCritical = tel.hospitals.reduce((sum, h) => sum + h.patients_critical, 0);

  return (
    <div className="flex h-full flex-col">
      <DashHeader title="MEDICAL" subtitle="Hospital capacity & patient flow" />
      <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <MetricCard label="Critical Patients" value={totalCritical}
            color={totalCritical > 20 ? "var(--danger-hot)" : "var(--danger)"} />
          <MetricCard label="Ambulances" value={`${ambulances.filter(a => a.status !== "idle").length}/${ambulances.length}`}
            sub="active/total" color="var(--ink-bright)" />
          <MetricCard label="Contaminated" value={snapshot.contaminated_nodes.length}
            unit="zones" color={snapshot.contaminated_nodes.length > 0 ? "var(--danger-hot)" : "var(--ok)"} />
        </div>

        {/* Hospital cards */}
        <div className="label-caps mb-2" style={{ fontSize: 8 }}>HOSPITALS</div>
        <div className="space-y-3 mb-5">
          {tel.hospitals.map((h) => {
            const occ = h.bed_occupancy_pct;
            const occColor = occ > 90 ? "var(--danger-hot)" : occ > 70 ? "var(--danger)" : "var(--ok)";
            return (
              <div key={h.node} className="rounded-xl border border-[var(--hairline)] bg-[var(--bg-inset)] px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--ink-dim)]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v12H4zM12 9v6M9 12h6" /></svg></span>
                    <span className="display text-[12px] font-semibold text-[var(--ink-bright)]">{h.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {h.generator_failed && (
                      <span className="pill bg-[rgba(220,38,38,0.12)] px-2 py-0.5 text-[8px] font-bold text-[var(--danger-hot)]">
                        GEN FAILED
                      </span>
                    )}
                    {h.on_backup_power && !h.generator_failed && (
                      <span className="pill bg-[rgba(217,119,6,0.10)] px-2 py-0.5 text-[8px] font-bold text-[var(--danger)]">
                        BACKUP PWR
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] text-[var(--ink-dim)]">Bed Occupancy</span>
                      <span className="mono text-[10px] font-bold" style={{ color: occColor }}>{occ}%</span>
                    </div>
                    <ProgressBar value={occ} color={occColor} height={5} />
                  </div>
                  <div className="text-center">
                    <div className="display text-[16px] font-bold text-[var(--danger)]">{h.patients_critical}</div>
                    <div className="text-[8px] text-[var(--ink-faint)]">CRITICAL</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Ambulance fleet */}
        <div className="label-caps mb-2" style={{ fontSize: 8 }}>AMBULANCE FLEET</div>
        <div className="space-y-1.5">
          {ambulances.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)] px-3 py-2">
              <span className="text-[var(--ink-dim)]"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h13v8H3zM16 11h3l2 3v2h-5zM8 10v4M6 12h4" /></svg></span>
              <span className="mono text-[10px] text-[var(--ink-dim)] w-[60px]">{a.id}</span>
              <span className="text-[10px] text-[var(--ink)] flex-1">{a.location.replace(/_/g, " ")}</span>
              <span className="mono text-[10px] text-[var(--ink-dim)]">{a.passengers} pts</span>
              <StatusPill status={a.status} />
            </div>
          ))}
          {ambulances.length === 0 && (
            <div className="text-[11px] text-[var(--ink-dim)] py-2">No ambulances deployed</div>
          )}
        </div>
      </div>
    </div>
  );
});
