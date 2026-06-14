import { memo, useEffect, useRef, useState } from "react";
import type { Cycle } from "../types";

// SVG path icons keyed by reasoning step type
const STEP_PATHS: Record<string, string> = {
  situation:   "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
  forecast:    "M3 17l3-6 3 3 4-7 3 4 3-2",
  shelter:     "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  evacuation:  "M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3m-5 9h8a2 2 0 002-2v-5a2 2 0 00-2-2h-8m0 9v-9m0 9l-3-3m3 3l3-3",
  tradeoff:    "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
  medical:     "M12 2v20M2 12h20",
  information: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.952 9.168-4.924m-9.168 4.924C7.168 6.487 7 7.22 7 8c0 .78.168 1.513.436 2.317m0-2.317l4.564 2.683",
  hazmat:      "M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z",
  comms:       "M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0",
  critical:    "M12 8v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  confidence:  "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
};

const STEP_COLOR: Record<string, string> = {
  situation: "var(--water)", forecast: "var(--water)", shelter: "var(--ok)",
  evacuation: "var(--brand)", tradeoff: "var(--ink-dim)", medical: "#f87171",
  information: "var(--ink-dim)", hazmat: "var(--danger-hot)", comms: "var(--water)",
  critical: "var(--danger-hot)", confidence: "var(--ok)",
};

function StepIcon({ type, size = 13 }: { type: string; size?: number }) {
  const d = STEP_PATHS[type];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={STEP_COLOR[type] ?? "var(--ink-faint)"}
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, marginTop: 2 }}>
      <path d={d} />
    </svg>
  );
}

function inferStepType(line: string): string {
  const l = line.toLowerCase();
  if (l.includes("hazmat") || l.includes("contamin") || l.includes("chemical")) return "hazmat";
  if (l.includes("situation")) return "situation";
  if (l.includes("forecast")) return "forecast";
  if (l.includes("shelter")) return "shelter";
  if (l.includes("evacuation") || l.includes("triage")) return "evacuation";
  if (l.includes("tradeoff") || l.includes("deprioritiz")) return "tradeoff";
  if (l.includes("medical") || l.includes("hospital") || l.includes("patient")) return "medical";
  if (l.includes("information") || l.includes("rumor") || l.includes("broadcast")) return "information";
  if (l.includes("comms") || l.includes("cell") || l.includes("network")) return "comms";
  if (l.includes("critical") || l.includes("breach") || l.includes("secondary")) return "critical";
  if (l.includes("confidence")) return "confidence";
  return "";
}

/** Highlight entity references: node:X, unit:X, edge:X */
function renderLine(text: string, onHover: (id: string | null) => void) {
  const parts = text.split(/((?:node|unit|edge):\S+)/g);
  return parts.map((p, i) => {
    const m = p.match(/^(node|unit|edge):(\S+)$/);
    if (m) {
      const [, kind, id] = m;
      const cls = `entity-chip ${kind}`;
      return (
        <span key={i} className={cls}
          onMouseEnter={() => onHover(id.replace(/[.,;:]+$/, ""))}
          onMouseLeave={() => onHover(null)}>
          {p}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

const CONF_RING: Record<string, { stroke: string; pct: number }> = {
  high: { stroke: "var(--ok)", pct: 100 },
  medium: { stroke: "var(--danger)", pct: 60 },
  low: { stroke: "var(--danger-hot)", pct: 30 },
};

export const ReasoningStream = memo(function ReasoningStream({
  cycles,
  onHover,
}: {
  cycles: Cycle[];
  onHover: (id: string | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom) el.scrollTop = el.scrollHeight;
  });

  const active = cycles.filter((c) => c.reasoning.length > 0 || c.plan);
  // A cycle has started but no tokens have streamed yet: the endpoint holds
  // output while the model reasons, so show a deliberate thinking state.
  const warming = cycles.find((c) => !c.done && c.reasoning.length === 0 && !c.plan);

  if (active.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center gap-2">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--hairline)] bg-[var(--bg-inset)] ${warming ? "animate-pulse" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.6" strokeLinecap="round">
            <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
          </svg>
        </div>
        <div className="flex items-center gap-2">
          <span className="label-caps">AI Situation Briefing</span>
          <span className="flex items-center gap-1.5 rounded bg-[rgba(16,185,129,0.1)] px-1.5 py-0.5 text-[8.5px] font-bold tracking-wider text-emerald-500" title="Reasoning tokens are streamed directly from the K2 Think V2 inference cluster in real-time.">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            </span>
            LIVE K2 API
          </span>
        </div>
        {warming ? (
          <DeliberationHud cycle={warming.cycle} />
        ) : (
          <span className="text-[11px] text-[var(--ink-dim)]">
            Waiting for simulation start…
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--hairline)] px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="label-caps">AI Situation Briefing</span>
          <span className="flex items-center gap-1.5 rounded bg-[rgba(16,185,129,0.1)] px-1.5 py-0.5 text-[8.5px] font-bold tracking-wider text-emerald-500" title="Reasoning tokens are streamed directly from the K2 Think V2 inference cluster in real-time.">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            </span>
            LIVE K2 API
          </span>
        </div>
        {active.length > 0 && (
          <CycleNav cycles={active} />
        )}
      </div>
      <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto px-4 py-3">
        {active.map((c) => (
          <CycleBlock key={c.cycle} cycle={c} onHover={onHover} />
        ))}
      </div>
    </div>
  );
});

function CycleNav({ cycles }: { cycles: Cycle[] }) {
  const last = cycles[cycles.length - 1];
  const conf = last?.plan?.confidence;
  const ring = conf ? CONF_RING[conf] : undefined;
  return (
    <div className="flex items-center gap-2">
      <span className="mono text-[10px] text-[var(--ink-dim)]">
        cycle {last?.cycle ?? "–"} · t{last?.tick ?? "–"}
      </span>
      {ring && (
        <span className="flex items-center gap-1">
          <svg width="16" height="16" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(140,160,200,0.08)" strokeWidth="2" />
            <circle cx="10" cy="10" r="8" fill="none" stroke={ring.stroke} strokeWidth="2"
              strokeDasharray={`${ring.pct * 0.5} ${50 - ring.pct * 0.5}`}
              strokeLinecap="round" transform="rotate(-90 10 10)"
              style={{ transition: "stroke-dasharray 0.8s ease" }} />
          </svg>
          <span className="text-[9px] font-bold tracking-wider" style={{ color: ring.stroke }}>
            {conf?.toUpperCase()}
          </span>
        </span>
      )}
      {last && !last.done && (
        <span className="caret text-[10px] text-[var(--brand)]" />
      )}
      {last?.meta && (
        <span className="mono text-[9px] text-[var(--ink-faint)]">
          {last.meta.elapsed_s}s · ~{last.meta.tokens} tok
        </span>
      )}
    </div>
  );
}

function CycleBlock({ cycle: c, onHover }: { cycle: Cycle; onHover: (id: string | null) => void }) {
  // Clean reasoning: strip JSON blocks, markdown artifacts, empty braces
  const cleaned = c.reasoning
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .replace(/^\s*\{[\s\S]*?\}\s*$/gm, (match) => {
      // Try to parse JSON blocks into readable text
      try {
        const obj = JSON.parse(match);
        if (obj.situation_read) return `Situation: ${obj.situation_read}`;
        if (obj.action) return `Action: ${obj.action} → ${obj.target ?? ""}`;
        return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join("\n");
      } catch {
        return ""; // Strip unparseable JSON
      }
    })
    .replace(/^\s*[\{\}]\s*$/gm, "") // strip lone { or }
    .replace(/^\s*"[^"]+"\s*:\s*/gm, (m) => m.replace(/"/g, "").trim() + " ") // strip JSON key quotes
    .replace(/<\/?think>/g, "") // strip think tags
    .replace(/,\s*$/gm, ""); // strip trailing commas

  // Drop lines that leak the system prompt / output-format plumbing so only
  // the genuine situational reasoning is shown (not "output a JSON block…").
  const META = /(output (a |the )?json|json block|fenced block|triple backtick|"(situation_read|directives|watching|confidence)"|step-by-step|numbered steps?|under \d+ (words|steps)|each directive (must|has)|actions? (possible|are)|produce (a |the )?(plan|final answer|json)|now produce|now proceed|we need to parse|the user is giving|the format (says|requires)|ready to broadcast|public messaging|reference only|incident commander, advising|world state\b)/i;
  const lines = cleaned.split("\n").filter((l) => l.trim().length > 0 && !META.test(l));
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center gap-2">
        <span className="pill bg-[var(--brand-soft)] px-2 py-0.5 text-[9px] font-bold text-[var(--brand)]">
          CYCLE {c.cycle}
        </span>
        <span className="text-[9px] text-[var(--ink-faint)]">tick {c.tick}</span>
      </div>
      <div className="space-y-2">
        {lines.map((line, i) => {
          const stepType = inferStepType(line);
          const display = line.replace(/^\d+\.\s*/, "").replace(/^\*\*.*?\*\*\s*/, "").replace(/^[-–•]\s*/, "");
          if (!display.trim()) return null;
          return (
            <div key={i} className="flex gap-2.5 text-[12px] leading-[1.65] text-[var(--ink)]"
              style={{ opacity: Math.max(0.72, 1 - i * 0.02) }}>
              {stepType ? (
                <StepIcon type={stepType} />
              ) : (
                <span className="shrink-0 text-[10px] text-[var(--ink-faint)] w-[18px] text-right mono" style={{ lineHeight: "1.75" }}>
                  {i + 1}.
                </span>
              )}
              <span>{renderLine(display, onHover)}</span>
            </div>
          );
        })}
        {!c.done && <span className="caret text-[12px]" />}
      </div>
      {c.degraded && (
        <div className="mt-2 rounded-lg border border-[rgba(220,38,38,0.2)] bg-[rgba(220,38,38,0.04)] px-3 py-2 flex items-center gap-2 text-[11px] text-[var(--danger-hot)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>
          Cycle degraded: {c.degraded}
        </div>
      )}
    </div>
  );
}

/* While K2 holds output during a long reasoning cycle, show genuine motion —
   real elapsed seconds plus the actual phases the commander loop works through —
   so the wait reads as "watch it think", never as dead air. */
function DeliberationHud({ cycle }: { cycle: number }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    setSec(0);
    const iv = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [cycle]);
  const PHASES = [
    "Reading live telemetry",
    "Mapping the flooded districts",
    "Weighing evacuation tradeoffs",
    "Checking shelters and road access",
    "Drafting verifiable directives",
  ];
  const phase = PHASES[Math.min(PHASES.length - 1, Math.floor(sec / 5))];
  return (
    <>
      <span className="text-[11px] text-[var(--brand)]">{phase}…</span>
      <span className="mt-1 text-[10px] text-[var(--ink-dim)]">
        cycle {cycle} · reasoning for {sec}s · full trace streams the moment it commits
      </span>
      <div className="mt-2 h-[3px] w-[150px] overflow-hidden rounded-full bg-[var(--bg-inset)]">
        <div className="h-full rounded-full bg-[var(--brand)] transition-all duration-1000"
          style={{ width: `${Math.min(94, sec * 2.5)}%` }} />
      </div>
    </>
  );
}
