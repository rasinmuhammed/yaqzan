import { useMemo, useRef, useEffect, useState } from "react";
import type { Snapshot, TickerEvent } from "../types";

const TREND = (curr: number, prev: number | undefined) => {
  if (prev === undefined) return "";
  const d = curr - prev;
  if (d > 5) return "↑";
  if (d > 0.5) return "↗";
  if (d < -5) return "↓";
  if (d < -0.5) return "↘";
  return "→";
};

const SEV_BADGE: Record<string, { bg: string; fg: string }> = {
  critical: { bg: "rgba(220,38,38,0.12)", fg: "#ef4444" },
  high: { bg: "rgba(217,119,6,0.10)", fg: "#f59e0b" },
  medium: { bg: "rgba(59,125,216,0.10)", fg: "#5ba0e8" },
  low: { bg: "rgba(140,160,200,0.06)", fg: "var(--ink-dim)" },
};

interface Props {
  snapshot: Snapshot | null;
  events: TickerEvent[];
  riskHistory: number[];
  running: boolean;
  film: boolean;
  cycleCount: number;
  reportsTriaged: number;
  send: (msg: Record<string, unknown>) => void;
}

export function BottomStrip({ snapshot, events, riskHistory, running, film, cycleCount, reportsTriaged, send }: Props) {
  const tel = snapshot?.telemetry;
  const tick = snapshot?.tick ?? 0;
  const maxTick = 30;
  const prevRisk = riskHistory.length >= 2 ? riskHistory[riskHistory.length - 2] : undefined;
  const [activeSpeed, setActiveSpeed] = useState<number>(1.5);

  return (
    <div className="panel flex h-full items-center gap-0 px-0">
      {/* Sim controls */}
      {!film && (
        <div className="flex shrink-0 items-center gap-2 border-r border-[var(--hairline)] px-3">
          <div className="flex items-center gap-1.5">
          <button
            onClick={() => send({ cmd: running ? "pause" : "start" })}
            className="pill flex items-center gap-1.5 border border-[var(--brand-line)] bg-[var(--brand-soft)] px-3 py-1 text-[10px] font-semibold text-[var(--brand)] transition-all hover:bg-[var(--brand)] hover:text-white"
          >
            {running ? (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                Pause
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                Start
              </>
            )}
          </button>
          <button
            onClick={() => send({ cmd: "reset" })}
            className="pill border border-[var(--hairline)] bg-transparent px-2.5 py-1 text-[10px] text-[var(--ink-dim)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
          >
            Reset
          </button>
          <button
            onClick={() => send({ cmd: "jump_time" })}
            className="pill border border-[var(--hairline)] bg-transparent px-2.5 py-1 text-[10px] font-bold text-[var(--ink-dim)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
            title="Fast-forward 15 ticks instantly"
          >
            Skip Intro
          </button>
          </div>
          <div className="flex items-center gap-0.5 ml-1 rounded-md border border-[var(--hairline)] bg-[var(--bg-inset)] p-0.5">
            {[
              { label: "1x", val: 2.0 },
              { label: "2x", val: 1.0 },
              { label: "5x", val: 0.4 },
            ].map((s) => (
              <button
                key={s.label}
                onClick={() => { setActiveSpeed(s.val); send({ cmd: "set_speed", seconds: s.val }); }}
                className={`px-2 py-[3px] text-[9px] font-bold tracking-wider rounded transition-colors ${activeSpeed === s.val ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-[var(--ink-dim)] hover:text-[var(--ink-bright)] hover:bg-[var(--bg-raised)]"}`}
                title={`Set speed to ${s.label}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Timeline scrubber — drag to seek to any point in the drill instantly */}
      <div className="flex shrink-0 flex-col items-center gap-1 border-r border-[var(--hairline)] px-4">
        <div className="flex items-baseline gap-1.5">
          <span className="mono text-[16px] font-bold text-[var(--ink-bright)]">{tick}</span>
          <span className="mono text-[10px] text-[var(--ink-dim)]">/ {maxTick}</span>
          <span className="label-caps ml-1" style={{ fontSize: 7 }}>timeline</span>
        </div>
        <input
          type="range" min={0} max={maxTick} value={Math.min(tick, maxTick)}
          onChange={(e) => send({ cmd: "seek", tick: Number(e.target.value) })}
          title="Drag to scrub through the drill"
          className="yaqzan-scrubber w-[120px]"
          style={{ ["--pct" as string]: `${(Math.min(tick, maxTick) / maxTick) * 100}%` }}
        />
      </div>

      {/* Key metrics with trend arrows */}
      <div className="flex flex-1 items-center gap-0">
        <MetricCell
          label="PEOPLE AT RISK"
          value={(snapshot?.casualties_at_risk ?? 0).toLocaleString()}
          trend={TREND(snapshot?.casualties_at_risk ?? 0, prevRisk)}
          critical={(snapshot?.casualties_at_risk ?? 0) > 15000}
          color={
            (snapshot?.casualties_at_risk ?? 0) > 15000
              ? "#ffffff" // Will be contrasted against red bg in critical mode
              : (snapshot?.casualties_at_risk ?? 0) > 5000
                ? "var(--danger)"
                : "var(--ink-bright)"
          }
        />
        <MetricCell
          label="PEOPLE SAVED"
          value={(snapshot?.total_evacuated ?? 0).toLocaleString()}
          color="var(--ok)"
        />
        {/* Honest per-instance throughput: citizen reports the AI has triaged */}
        <MetricCell
          label="AI TRIAGED"
          value={reportsTriaged.toLocaleString()}
          color="var(--brand)"
        />
        <MetricCell
          label="911 CALL RATE"
          value={`${tel?.calls_911_per_min ?? 0}/m`}
          critical={(tel?.calls_911_per_min ?? 0) > 500}
          color={
            (tel?.calls_911_per_min ?? 0) > 500
              ? "#ffffff"
              : "var(--ink-bright)"
          }
        />
        <MetricCell
          label="NETWORK HEALTH"
          value={`${tel?.cell_network_pct ?? 100}%`}
          color={
            (tel?.cell_network_pct ?? 100) < 60
              ? "var(--danger-hot)"
              : "var(--ink-bright)"
          }
        />
        <MetricCell
          label="AI DECISIONS"
          value={String(cycleCount)}
          color="var(--brand)"
        />

        {/* Mini risk sparkline */}
        <div className="flex flex-col items-center gap-0 border-l border-[var(--hairline)] px-4">
          <span className="label-caps mb-1" style={{ fontSize: 9 }}>RISK CURVE</span>
          <MiniSparkline data={riskHistory} color="var(--danger-hot)" height={24} width={80} />
        </div>
      </div>

      {/* Event ticker */}
      <div className="flex min-w-0 flex-1 flex-col gap-0 border-l border-[var(--hairline)] px-3 py-1">
        <span className="label-caps mb-0.5" style={{ fontSize: 8 }}>EVENT LOG</span>
        <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-[2px] overflow-y-auto">
          {events.slice(-3).reverse().map((ev, i) => {
            const badge = SEV_BADGE[ev.severity] ?? SEV_BADGE.low;
            return (
              <div key={`${ev.tick}-${i}`} className={`flex items-start gap-1.5 text-[10px] leading-snug ${i === 0 ? "ticker-item" : ""}`}>
                <span className="mono shrink-0 text-[var(--ink-faint)]">t{ev.tick}</span>
                <span className="pill inline-block shrink-0 px-1.5 py-[0.5px] text-[8px] font-bold uppercase"
                  style={{ background: badge.bg, color: badge.fg }}>
                  {ev.severity}
                </span>
                <span className="min-w-0 truncate text-[var(--ink)]">{ev.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  trend,
  color,
  critical,
}: {
  label: string;
  value: string;
  trend?: string;
  color?: string;
  critical?: boolean;
}) {
  const trendColor = trend === "↑" || trend === "↗" ? "var(--danger-hot)" : trend === "↓" || trend === "↘" ? "var(--ok)" : "var(--ink-dim)";
  
  if (critical) {
    return (
      <div className="flex flex-col items-center justify-center gap-0.5 border-l border-[var(--hairline)] px-4 bg-[var(--danger-hot)] shadow-[inset_0_0_20px_rgba(220,38,38,0.4)] animate-pulse h-full">
        <span className="label-caps text-white font-bold" style={{ fontSize: 9, letterSpacing: "1px" }}>{label}</span>
        <div className="flex items-baseline gap-1">
          <span className="mono text-[18px] font-bold text-white drop-shadow-md">
            {value}
          </span>
          {trend && (
            <span className="text-[14px] font-bold text-white">
              {trend}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-0.5 border-l border-[var(--hairline)] px-4 first:border-l-0 h-full">
      <span className="label-caps" style={{ fontSize: 9, letterSpacing: "1px" }}>{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="mono text-[18px] font-bold" style={{ color: color ?? "var(--ink-bright)" }}>
          {value}
        </span>
        {trend && (
          <span className="text-[14px] font-bold" style={{ color: trendColor }}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}

function MiniSparkline({ data, color, height, width }: { data: number[]; color: string; height: number; width: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || data.length < 2) return;
    const dpr = window.devicePixelRatio ?? 1;
    ctx.canvas.width = width * dpr;
    ctx.canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const max = Math.max(...data, 1);
    const pts = data.map((v, i) => ({
      x: (i / (data.length - 1)) * width,
      y: height - (v / max) * (height - 4) - 2,
    }));

    // filled area
    ctx.beginPath();
    ctx.moveTo(pts[0].x, height);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, height);
    ctx.closePath();
    ctx.fillStyle = color.replace(")", ", 0.08)").replace("var(", "rgba(220,38,38,");
    ctx.fill();

    // line
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = color.startsWith("var(") ? "#ef4444" : color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // tip dot
    const tip = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }, [data, color, height, width]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ width, height }} />;
}
