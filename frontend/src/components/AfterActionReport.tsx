import type { AppState } from "../store";

/* ═══════════════════════════════════════════════════════════════════
   AFTER-ACTION REPORT — the honest closing beat. Shown when a drill run
   completes. Every figure is a real per-instance count or a clearly
   labelled simulation measure. No "lives saved" theatre.
   ═══════════════════════════════════════════════════════════════════ */

function Stat({ value, label, sub, accent }: { value: string; label: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--bg-inset)] px-4 py-3.5">
      <div className="display text-[26px] font-bold leading-none tabular-nums" style={{ color: accent ?? "var(--ink-bright)" }}>
        {value}
      </div>
      <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-dim)]">{label}</div>
      {sub && <div className="mt-0.5 text-[9px] text-[var(--ink-faint)]">{sub}</div>}
    </div>
  );
}

export function AfterActionReport({ state, onClose, onReset }: {
  state: AppState; onClose: () => void; onReset: () => void;
}) {
  const { reportStats, aiStats, overridden, snapshot, baselineHistory, riskHistory } = state;
  const peakBase = Math.max(0, ...baselineHistory);
  const peakRisk = Math.max(0, ...riskHistory);
  const exposurePct = peakBase > 0 ? Math.round(((peakBase - peakRisk) / peakBase) * 100) : 0;
  const avgLatency = aiStats.cycles > 0 ? Math.round(aiStats.latencyTotal / aiStats.cycles) : 0;
  const tokK = aiStats.tokens >= 1000 ? `${(aiStats.tokens / 1000).toFixed(1)}k` : `${aiStats.tokens}`;
  const scenario = state.scenarios.find((s) => s.id === state.activeScenario)?.name ?? state.city?.name ?? "Drill";

  return (
    <div className="fixed inset-0 z-[2200] flex items-center justify-center bg-[rgba(6,9,13,0.78)] backdrop-blur-sm">
      <div className="w-[min(680px,94vw)] overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--bg-raised)] shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--hairline)] px-6 py-4"
          style={{ background: "linear-gradient(180deg, var(--brand-soft), transparent)" }}>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--brand-line)] bg-[var(--brand-soft)] text-[var(--brand)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
          </div>
          <div className="flex-1">
            <div className="display text-[16px] font-bold text-[var(--ink-bright)]">After-Action Report</div>
            <div className="text-[10px] text-[var(--ink-dim)]">{scenario} · training drill complete</div>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-faint)] transition-colors hover:bg-[var(--bg-inset)] hover:text-[var(--ink)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Public-reporting layer — real counts */}
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">Public reporting layer</div>
          <div className="mb-5 grid grid-cols-4 gap-3">
            <Stat value={reportStats.triaged.toLocaleString()} label="Reports triaged" sub="guidance + a verified op" accent="var(--brand)" />
            <Stat value={reportStats.merged.toLocaleString()} label="Duplicates merged" sub="no wasted response" />
            <Stat value={reportStats.dispatched.toLocaleString()} label="Ops dispatched" sub="operator-approved" accent="var(--ok)" />
            <Stat value={aiStats.rejected.toLocaleString()} label="Caught by verifier" sub="unsafe blocked" accent={aiStats.rejected > 0 ? "var(--danger-hot)" : "var(--ink-bright)"} />
          </div>

          {/* Decision-support layer — real counts */}
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">EOC decision support (K2 Think V2)</div>
          <div className="mb-5 grid grid-cols-4 gap-3">
            <Stat value={String(aiStats.cycles)} label="Replans" />
            <Stat value={tokK} label="Tokens reasoned" accent="var(--brand)" />
            <Stat value={`${avgLatency}s`} label="Per decision" />
            <Stat value={String(overridden.size)} label="Operator vetoes" />
          </div>

          {/* Drill measure — clearly labelled simulation figure */}
          <div className="rounded-xl border border-[var(--hairline)] bg-[var(--bg-inset)] px-4 py-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-dim)]">
                Drill measure · AI-coordinated vs no response
              </span>
              <span className="display text-[20px] font-bold tabular-nums text-[var(--ok)]">{exposurePct}%</span>
            </div>
            <div className="mt-1 text-[9px] leading-relaxed text-[var(--ink-faint)]">
              Lower peak population exposure in this seeded simulation. A modelled training measure for evaluating
              triage and dispatch quality — not a real-world lives-saved claim.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-6 py-4">
          <span className="text-[9px] text-[var(--ink-faint)]">Modelled on the 2018 Kerala floods · OpenStreetMap + NASA SRTM data</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onClose}
              className="pill border border-[var(--hairline)] px-4 py-2 text-[10px] font-semibold text-[var(--ink-dim)] transition-colors hover:text-[var(--ink)]">
              Review the board
            </button>
            <button onClick={onReset}
              className="pill border border-[var(--brand-line)] bg-[var(--brand-soft)] px-4 py-2 text-[10px] font-bold tracking-wider text-[var(--brand)] transition-colors hover:bg-[var(--brand)] hover:text-white">
              Run another drill
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
