import { memo, useMemo } from "react";
import type { Snapshot, TickerEvent, Cycle } from "../../types";
import { DashHeader, MetricCard } from "../Sidebar";

/* ═══════════════════════════════════════════════════════════════════
   OVERVIEW DASHBOARD — City-wide situational awareness at a glance.
   
   Designed for: Incident Commander wanting a 3-second status read.
   Shows: Key metrics, risk trend, active injects, response summary.
   ═══════════════════════════════════════════════════════════════════ */

export const OverviewDash = memo(function OverviewDash({
  snapshot,
  events,
  riskHistory,
  baselineHistory = [],
  cycles,
}: {
  snapshot: Snapshot | null;
  events: TickerEvent[];
  riskHistory: number[];
  baselineHistory?: number[];
  cycles: Cycle[];
}) {
  if (!snapshot) {
    return (
      <div className="flex h-full flex-col">
        <DashHeader title="SITUATION OVERVIEW" subtitle="City-wide status" />
        <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--ink-dim)]">
          Awaiting first data snapshot…
        </div>
      </div>
    );
  }

  const tel = snapshot.telemetry;
  const riskTrend = riskHistory.length >= 2
    ? riskHistory[riskHistory.length - 1] > riskHistory[riskHistory.length - 2] ? "up" : "down"
    : "flat";
  const evacRate = snapshot.total_evacuated > 0
    ? Math.round(snapshot.total_evacuated / Math.max(1, snapshot.tick) * 10)
    : 0;

  // Road status
  const totalEdges = snapshot.impassable_edges.length + snapshot.destroyed_edges.length;
  const hospitalStatus = tel.hospitals.map((h) => ({
    ...h,
    status: h.generator_failed ? "critical" : h.on_backup_power ? "backup" : "normal",
  }));

  return (
    <div className="flex h-full flex-col">
      <DashHeader title="SITUATION OVERVIEW" subtitle={`Tick ${snapshot.tick} · ${snapshot.severity_level.toUpperCase()}`}
        right={
          <span className={`pill px-2.5 py-1 text-[9px] font-bold ${
            snapshot.severity_level === "extreme" ? "bg-[rgba(220,38,38,0.12)] text-[var(--danger-hot)]" :
            snapshot.severity_level === "critical" ? "bg-[rgba(217,119,6,0.10)] text-[var(--danger)]" :
            "bg-[var(--ok-dim)] text-[var(--ok)]"
          }`}>
            {snapshot.severity_level.toUpperCase()}
          </span>
        }
      />
      <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
        {/* AI Situation Summary */}
        <AISummary snapshot={snapshot} />

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <MetricCard label="Population at Risk" value={snapshot.casualties_at_risk.toLocaleString()}
            trend={riskTrend} color={riskTrend === "up" ? "var(--danger-hot)" : "var(--ok)"} />
          <MetricCard label="Evacuated" value={snapshot.total_evacuated.toLocaleString()}
            trend="up" color="var(--ok)" sub={`~${evacRate}/tick rate`} />
          <MetricCard label="911 Call Rate" value={Math.round(tel.calls_911_per_min)}
            unit="/min" color={tel.calls_911_per_min > 300 ? "var(--danger)" : "var(--ink-bright)"} />
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <MetricCard label="Tide Gauge" value={tel.tide_gauge_m.toFixed(1)} unit="m"
            color={tel.tide_gauge_m > 2 ? "var(--danger-hot)" : "var(--water)"} />
          <MetricCard label="Rainfall" value={Math.round(tel.rainfall_mm_hr)} unit="mm/hr"
            color={tel.rainfall_mm_hr > 20 ? "var(--water)" : "var(--ink-bright)"} />
          <MetricCard label="Roads Down" value={totalEdges}
            color={totalEdges > 5 ? "var(--danger-hot)" : totalEdges > 0 ? "var(--danger)" : "var(--ok)"} />
        </div>

        {/* Commander effect: live run vs the deterministic no-AI ghost run */}
        <div className="mb-5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="label-caps" style={{ fontSize: 8 }}>DRILL · AI-COORDINATED RESPONSE VS NO RESPONSE</span>
            {snapshot.baseline_risk > snapshot.casualties_at_risk && (
              <span className="mono text-[10px] font-bold text-[var(--ok)]" title="Modelled population-exposure reduction in this training drill (same seed: no response vs AI-coordinated). A simulation measure, not a real-world claim.">
                {(((snapshot.baseline_risk - snapshot.casualties_at_risk) / Math.max(1, snapshot.baseline_risk)) * 100).toFixed(0)}% lower modelled exposure
              </span>
            )}
          </div>
          <EffectCurve risk={riskHistory} baseline={baselineHistory} />
        </div>

        {/* Infrastructure summary */}
        <div className="mb-5">
          <div className="label-caps mb-2" style={{ fontSize: 8 }}>INFRASTRUCTURE STATUS</div>
          <div className="space-y-2">
            <InfraRow icon="hospital" label="Hospitals" 
              value={`${hospitalStatus.filter(h => h.status === "normal").length}/${hospitalStatus.length} operational`}
              status={hospitalStatus.some(h => h.generator_failed) ? "critical" : "ok"} />
            <InfraRow icon="comms" label="Cell Network" 
              value={`${Math.round(tel.cell_network_pct)}% coverage`}
              status={tel.cell_network_pct < 50 ? "critical" : tel.cell_network_pct < 80 ? "warning" : "ok"} />
            <InfraRow icon="power" label="Power Grid" 
              value={`${tel.power_outage_nodes.length} towns affected`}
              status={tel.power_outage_nodes.length > 5 ? "critical" : tel.power_outage_nodes.length > 0 ? "warning" : "ok"} />
            <InfraRow icon="road" label="Road Network" 
              value={`${totalEdges} segments impassable`}
              status={totalEdges > 10 ? "critical" : totalEdges > 3 ? "warning" : "ok"} />
          </div>
        </div>

        {/* Active injects */}
        {snapshot.active_injects.length > 0 && (
          <div>
            <div className="label-caps mb-2" style={{ fontSize: 8 }}>ACTIVE INCIDENTS</div>
            <div className="space-y-1.5">
              {snapshot.active_injects.slice(-6).reverse().map((inj) => (
                <div key={inj.id} className="flex items-start gap-2 rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)] px-3 py-2">
                  <SeverityDot severity={inj.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-[var(--ink-bright)] leading-snug">{inj.headline}</div>
                    <div className="mt-0.5 text-[9px] text-[var(--ink-faint)]">t{inj.tick} · {inj.severity}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

/** Dual-curve chart: solid live risk vs dashed no-commander baseline,
 *  with the saved-lives gap shaded green. Both runs share one seed, so
 *  the gap is the commander's measured effect, not an estimate. */
function EffectCurve({ risk, baseline }: { risk: number[]; baseline: number[] }) {
  const n = Math.min(risk.length, baseline.length);
  const geo = useMemo(() => {
    if (n < 2) return null;
    const w = 400, h = 72;
    const maxY = Math.max(...risk.slice(0, n), ...baseline.slice(0, n), 100);
    const pt = (v: number, i: number) =>
      `${((i / (n - 1)) * w).toFixed(1)} ${(h - (v / maxY) * (h - 6) - 3).toFixed(1)}`;
    const riskPath = risk.slice(0, n).map((v, i) => `${i === 0 ? "M" : "L"} ${pt(v, i)}`).join(" ");
    const basePath = baseline.slice(0, n).map((v, i) => `${i === 0 ? "M" : "L"} ${pt(v, i)}`).join(" ");
    const gapPath =
      basePath + " " + [...risk.slice(0, n)].reverse().map((v, i) => `L ${pt(v, n - 1 - i)}`).join(" ") + " Z";
    return { riskPath, basePath, gapPath };
  }, [risk, baseline, n]);

  if (!geo) {
    return <div className="h-[72px] rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)]" />;
  }
  return (
    <div className="relative rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)] p-2">
      <svg viewBox="0 0 400 72" className="h-[72px] w-full" preserveAspectRatio="none">
        <path d={geo.gapPath} fill="rgba(16,185,129,0.10)" />
        <path d={geo.basePath} fill="none" stroke="rgba(220,38,38,0.45)" strokeWidth="1.3" strokeDasharray="4 4" />
        <path d={geo.riskPath} fill="none" stroke="#ef4444" strokeWidth="1.6" />
      </svg>
      <div className="mt-1 flex items-center gap-4 px-1">
        <span className="flex items-center gap-1.5 text-[8.5px] text-[var(--ink-dim)]">
          <svg width="14" height="4"><line x1="0" y1="2" x2="14" y2="2" stroke="#ef4444" strokeWidth="1.6" /></svg>
          with Yaqzan
        </span>
        <span className="flex items-center gap-1.5 text-[8.5px] text-[var(--ink-dim)]">
          <svg width="14" height="4"><line x1="0" y1="2" x2="14" y2="2" stroke="rgba(220,38,38,0.45)" strokeWidth="1.3" strokeDasharray="3 3" /></svg>
          no commander (same seed)
        </span>
        <span className="flex items-center gap-1.5 text-[8.5px] text-[var(--ink-dim)]">
          <span className="inline-block h-[7px] w-[10px] rounded-[2px]" style={{ background: "rgba(16,185,129,0.18)" }} />
          lives kept out of danger
        </span>
      </div>
    </div>
  );
}

function RiskCurve({ data }: { data: number[] }) {
  const { path, maxY, lastY } = useMemo(() => {
    if (data.length < 2) return { path: "", maxY: 0, lastY: 0 };
    const maxY = Math.max(...data, 100);
    const w = 400, h = 60;
    const pts = data.map((v, i) => ({
      x: (i / (data.length - 1)) * w,
      y: h - (v / maxY) * h,
    }));
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const fill = d + ` L ${w} ${h} L 0 ${h} Z`;
    return { path: d, fillPath: fill, maxY, lastY: data[data.length - 1] };
  }, [data]);

  if (data.length < 2) {
    return <div className="h-[60px] rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)]" />;
  }

  return (
    <div className="relative rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)] p-2">
      <svg viewBox="0 0 400 60" className="w-full h-[60px]">
        <defs>
          <linearGradient id="risk-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(220,38,38,0.25)" />
            <stop offset="100%" stopColor="rgba(220,38,38,0)" />
          </linearGradient>
        </defs>
        <path d={path + ` L 400 60 L 0 60 Z`} fill="url(#risk-grad)" />
        <path d={path} fill="none" stroke="var(--danger-hot)" strokeWidth="1.5" />
      </svg>
      <div className="absolute right-3 top-2 text-[10px] font-bold text-[var(--danger-hot)]">
        {lastY.toLocaleString()}
      </div>
    </div>
  );
}

const INFRA_PATHS: Record<string, string> = {
  hospital: "M4 8a2 2 0 012-2h12a2 2 0 012 2v12H4zM12 9v6M9 12h6",
  comms: "M5 12.5a7 7 0 0114 0M8.5 12.5a3.5 3.5 0 017 0M12 13v7",
  power: "M13 2L4.5 13.5H11l-1 8.5L19.5 10H13z",
  road: "M8 4L6 20M16 4l2 16M12 5v2.5M12 11v2.5M12 16.5V19",
};

function InfraRow({ icon, label, value, status }: {
  icon: string; label: string; value: string; status: "ok" | "warning" | "critical";
}) {
  const dot = status === "critical" ? "var(--danger-hot)" : status === "warning" ? "var(--danger)" : "var(--ok)";
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)] px-3 py-2">
      <span className="text-[var(--ink-dim)]">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d={INFRA_PATHS[icon] ?? ""} />
        </svg>
      </span>
      <div className="flex-1">
        <span className="text-[11px] font-medium text-[var(--ink)]">{label}</span>
        <span className="ml-2 text-[10px] text-[var(--ink-dim)]">{value}</span>
      </div>
      <span className="h-[6px] w-[6px] rounded-full" style={{ background: dot }} />
    </div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const color = severity === "critical" ? "var(--danger-hot)" :
    severity === "high" ? "var(--danger)" :
    severity === "medium" ? "var(--water)" : "var(--ink-dim)";
  return <span className="mt-1 h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: color }} />;
}

/* ═══ AI-generated situation summary ═══ */
function AISummary({ snapshot }: { snapshot: Snapshot }) {
  const tel = snapshot.telemetry;
  const threats: string[] = [];
  const actions: string[] = [];

  // Analyze current state
  if (snapshot.casualties_at_risk > 20000) threats.push(`${snapshot.casualties_at_risk.toLocaleString()} people remain at risk across flooded districts`);
  if (tel.hospitals.some(h => h.generator_failed)) threats.push("Hospital generator failure — critical patients on manual support");
  if (snapshot.contaminated_nodes.length > 0) threats.push(`Chemical contamination in ${snapshot.contaminated_nodes.length} zones`);
  if (tel.power_outage_nodes.length > 5) threats.push(`Power grid down in ${tel.power_outage_nodes.length} districts`);
  if (tel.cell_network_pct < 50) threats.push(`Cell network at ${Math.round(tel.cell_network_pct)}% — comms severely degraded`);
  if (snapshot.destroyed_edges.length > 0) threats.push(`${snapshot.destroyed_edges.length} road segments permanently destroyed`);

  // Generate priority actions
  const floodedDistricts = snapshot.nodes.filter(n => n.water_m > 1.5).length;
  if (floodedDistricts > 3) actions.push(`Deploy rescue boats to ${floodedDistricts} severely flooded districts`);
  if (snapshot.total_evacuated === 0) actions.push("Initiate immediate evacuation — 0 people moved so far");
  else actions.push(`Continue evacuation — ${snapshot.total_evacuated.toLocaleString()} moved, ${snapshot.casualties_at_risk.toLocaleString()} remaining`);
  if (tel.hospitals.some(h => h.generator_failed)) actions.push("Priority: evacuate critical patients from the hospital on failed backup power");
  if (tel.cell_network_pct < 60) actions.push("Deploy emergency cell relay to restore communications");

  // Determine phase
  const phase = snapshot.tick < 15 ? "ONSET" : snapshot.tick < 35 ? "ESCALATION" : snapshot.tick < 55 ? "PEAK CRISIS" : snapshot.tick < 80 ? "STABILIZATION" : "RECOVERY";
  const phaseColor = snapshot.tick < 35 ? "var(--danger)" : snapshot.tick < 55 ? "var(--danger-hot)" : snapshot.tick < 80 ? "var(--water)" : "var(--ok)";

  return (
    <div className="mb-5 rounded-xl border border-[var(--hairline)] bg-[var(--bg-inset)] px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[var(--brand)]"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2"/></svg></span>
        <span className="label-caps flex-1" style={{ fontSize: 8 }}>AI SITUATION ASSESSMENT</span>
        <span className="pill px-2 py-0.5 text-[8px] font-bold" style={{ background: `${phaseColor}20`, color: phaseColor }}>
          {phase}
        </span>
      </div>
      {threats.length > 0 && (
        <div className="mb-2">
          <div className="text-[9px] font-semibold text-[var(--danger)] tracking-wide mb-1">ACTIVE THREATS</div>
          {threats.map((t, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-[var(--ink)] leading-relaxed ml-1">
              <span className="text-[var(--danger)] mt-0.5 shrink-0">•</span>
              <span>{t}</span>
            </div>
          ))}
        </div>
      )}
      {actions.length > 0 && (
        <div>
          <div className="text-[9px] font-semibold text-[var(--brand)] tracking-wide mb-1">→ RECOMMENDED ACTIONS</div>
          {actions.map((a, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-[var(--ink-dim)] leading-relaxed ml-1">
              <span className="text-[var(--brand)] mt-0.5 shrink-0">{i + 1}.</span>
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
