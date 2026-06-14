import { memo } from "react";
import type { City, Snapshot } from "../../types";
import { DashHeader, MetricCard, ProgressBar } from "../Sidebar";

/* ═══════════════════════════════════════════════════════════════════
   COMMS DASHBOARD — 911 call volume, cell network, social signals.
   
   Designed for: Communications officer monitoring public channels.
   ═══════════════════════════════════════════════════════════════════ */

export const CommsDash = memo(function CommsDash({
  city,
  snapshot,
}: {
  city: City | null;
  snapshot: Snapshot | null;
}) {
  if (!snapshot || !city) {
    return (
      <div className="flex h-full flex-col">
        <DashHeader title="911 & COMMUNICATIONS" subtitle="Public channel monitoring" />
        <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--ink-dim)]">
          Awaiting data…
        </div>
      </div>
    );
  }

  const tel = snapshot.telemetry;
  const nodeMap = Object.fromEntries(city.nodes.map((n) => [n.id, n]));

  // Sort 911 calls by volume, descending
  const calls = Object.entries(tel.calls_by_district)
    .map(([id, vol]) => ({ id, name: nodeMap[id]?.name ?? id.replace(/_/g, " "), vol }))
    .sort((a, b) => b.vol - a.vol);

  const maxCalls = Math.max(...calls.map((c) => c.vol), 1);

  const credColors: Record<string, { bg: string; fg: string }> = {
    verified: { bg: "rgba(22,163,74,0.10)", fg: "var(--ok)" },
    plausible: { bg: "rgba(59,125,216,0.10)", fg: "#5ba0e8" },
    unverified: { bg: "rgba(217,119,6,0.10)", fg: "var(--danger)" },
    false: { bg: "rgba(220,38,38,0.10)", fg: "var(--danger-hot)" },
  };

  return (
    <div className="flex h-full flex-col">
      <DashHeader title="911 & COMMUNICATIONS" subtitle="Call volume · Cell network · Social signals" />
      <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <MetricCard label="911 Calls" value={Math.round(tel.calls_911_per_min)} unit="/min"
            color={tel.calls_911_per_min > 400 ? "var(--danger-hot)" : "var(--ink-bright)"} />
          <MetricCard label="Cell Network" value={`${Math.round(tel.cell_network_pct)}%`}
            color={tel.cell_network_pct < 50 ? "var(--danger-hot)" : tel.cell_network_pct < 80 ? "var(--danger)" : "var(--ok)"} />
          <MetricCard label="Congestion" value={`${Math.round(tel.traffic_congestion_pct)}%`}
            color={tel.traffic_congestion_pct > 70 ? "var(--danger)" : "var(--ink-bright)"} />
        </div>

        {/* 911 by district */}
        <div className="mb-5">
          <div className="label-caps mb-2" style={{ fontSize: 8 }}>911 CALLS BY DISTRICT</div>
          <div className="space-y-1.5">
            {calls.slice(0, 12).map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--ink-dim)] w-[110px] truncate">{c.name}</span>
                <div className="flex-1 h-[14px] rounded-sm overflow-hidden" style={{ background: "rgba(140,160,200,0.06)" }}>
                  <div className="h-full rounded-sm transition-all duration-500"
                    style={{
                      width: `${(c.vol / maxCalls) * 100}%`,
                      background: c.vol > maxCalls * 0.8 ? "var(--danger-hot)" : c.vol > maxCalls * 0.5 ? "var(--danger)" : "var(--water)",
                    }} />
                </div>
                <span className="mono text-[9px] text-[var(--ink-dim)] w-[24px] text-right">{c.vol}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Social signals */}
        {tel.social_signals.length > 0 && (
          <div>
            <div className="label-caps mb-2" style={{ fontSize: 8 }}>SOCIAL SIGNALS</div>
            <div className="space-y-1.5">
              {tel.social_signals.map((sig, i) => {
                const cred = credColors[sig.credibility] ?? credColors.unverified;
                return (
                  <div key={i} className="rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)] px-3 py-2">
                    <div className="flex items-start gap-2">
                      <span className="text-[11px] text-[var(--ink)] leading-snug flex-1">{sig.text}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="pill px-1.5 py-[1px] text-[7px] font-bold"
                          style={{ background: cred.bg, color: cred.fg }}>
                          {sig.credibility.toUpperCase()}
                        </span>
                        <span className="mono text-[8px] text-[var(--ink-faint)]">×{sig.volume}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Broadcasts */}
        {snapshot.alerts_broadcast.length > 0 && (
          <div className="mt-5">
            <div className="label-caps mb-2" style={{ fontSize: 8 }}>BROADCASTS ISSUED</div>
            <div className="space-y-1">
              {snapshot.alerts_broadcast.map((msg, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px] text-[var(--ink-dim)]">
                  <span className="shrink-0 text-[var(--ink-faint)]"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1zM15 9a3 3 0 010 6" /></svg></span>
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
