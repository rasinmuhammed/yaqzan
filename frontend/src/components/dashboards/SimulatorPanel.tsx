import { memo, useEffect, useRef, useState } from "react";
import type { ScenarioInfo } from "../../store";
import { DashHeader, MetricCard, ProgressBar } from "../Sidebar";

/* ── Prompt-to-disaster: K2 designs the scenario it will then fight ── */

interface GenState {
  status: "idle" | "designing" | "done" | "failed";
  reasoning: string;
  result?: { name: string; description: string; ticks: number; inject_count: number };
  error?: string;
}

const BRIEF_IDEAS = [
  "Supertanker collision breaches the harbor wall at 2am during a festival",
  "Back-to-back storm surges 12 hours apart, pumps fail before the second",
  "Slow river flood meets a citywide power failure and phone outages",
];

function DisasterDesigner({ send }: { send: (msg: Record<string, unknown>) => void }) {
  const [prompt, setPrompt] = useState("");
  const [gen, setGen] = useState<GenState>({ status: "idle", reasoning: "" });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (msg.type === "scenario_gen_started") setGen({ status: "designing", reasoning: "" });
      else if (msg.type === "scenario_gen_reasoning")
        setGen((g) => ({ ...g, status: "designing", reasoning: g.reasoning + msg.text }));
      else if (msg.type === "scenario_gen_done")
        setGen((g) => ({ ...g, status: "done", result: msg }));
      else if (msg.type === "scenario_gen_failed")
        setGen((g) => ({ ...g, status: "failed", error: msg.error }));
    };
    window.addEventListener("yaqzan_ws", handler);
    return () => window.removeEventListener("yaqzan_ws", handler);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [gen.reasoning]);

  const designing = gen.status === "designing";
  const submit = () => {
    const p = prompt.trim();
    if (!p || designing) return;
    send({ cmd: "generate_scenario", prompt: p });
  };

  return (
    <div className="mb-5 rounded-xl border border-[var(--brand-line)] bg-[var(--brand-soft)] px-4 py-3.5">
      <div className="mb-1 flex items-center gap-2">
        <span className="label-caps" style={{ fontSize: 8.5, color: "var(--brand)" }}>
          Design a disaster
        </span>
        <span className="text-[9px] text-[var(--ink-dim)]">
          K2 authors the scenario, then commands the response to it
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Describe the disaster to exercise against…"
          disabled={designing}
          className="flex-1 rounded-lg border border-[var(--hairline)] bg-[var(--bg-raised)] px-3 py-2 text-[11px] text-[var(--ink)] outline-none transition-colors focus:border-[var(--brand-line)]"
        />
        <button
          onClick={submit}
          disabled={!prompt.trim() || designing}
          className={`pill px-3.5 py-2 text-[10px] font-bold tracking-wider transition-all ${
            designing
              ? "animate-pulse bg-[var(--brand-soft)] text-[var(--brand)]"
              : "bg-[var(--brand)] text-white hover:opacity-85 disabled:opacity-30"
          }`}
        >
          {designing ? "DESIGNING…" : "GENERATE"}
        </button>
      </div>
      {gen.status === "idle" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {BRIEF_IDEAS.map((b, i) => (
            <button key={i} onClick={() => setPrompt(b)}
              className="rounded-md border border-[var(--hairline)] px-2 py-1 text-[9px] text-[var(--ink-dim)] transition-colors hover:border-[var(--brand-line)] hover:text-[var(--brand)]">
              {b}
            </button>
          ))}
        </div>
      )}
      {(designing || gen.reasoning) && gen.status !== "done" && (
        <div className="mt-2.5">
          <div className="label-caps mb-1 flex items-center gap-1.5" style={{ fontSize: 8 }}>
            <span className={`h-[4px] w-[4px] rounded-full bg-[var(--brand)] ${designing ? "animate-pulse" : ""}`} />
            Designer reasoning
          </div>
          <div ref={scrollRef}
            className="scroll-thin max-h-[120px] overflow-y-auto rounded-lg border border-[var(--hairline)] bg-[var(--bg-raised)] px-3 py-2">
            <pre className="mono whitespace-pre-wrap text-[9.5px] leading-relaxed text-[var(--ink-dim)]">
              {gen.reasoning || "Reading the city graph…"}
            </pre>
          </div>
        </div>
      )}
      {gen.status === "done" && gen.result && (
        <div className="mt-2.5 rounded-lg border border-[var(--ok)] bg-[var(--ok-dim)] px-3 py-2">
          <div className="text-[11px] font-semibold text-[var(--ok)]">
            {gen.result.name} · loaded and ready
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--ink-dim)]">
            {gen.result.description} · {gen.result.inject_count} injects · {gen.result.ticks} ticks.
            Press Start to run it; the commander takes it from there.
          </div>
        </div>
      )}
      {gen.status === "failed" && (
        <div className="mt-2.5 rounded-lg border border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.05)] px-3 py-2 text-[10px] text-[var(--danger-hot)]">
          Design rejected by the validator: {gen.error}. Adjust the brief and try again.
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SIMULATOR PANEL — Run scenarios at high speed to assess preparedness.
   
   Designed for: Emergency planners evaluating response capabilities
   before a disaster strikes. Run "what-if" scenarios and compare results.
   ═══════════════════════════════════════════════════════════════════ */

interface SimResult {
  scenario: string;
  scenarioName: string;
  peakRisk: number;
  baselinePeakRisk: number;
  reductionPct: number;
  totalEvacuated: number;
  peakTide: number;
  blockedRoads: number;
  hospitalOverload: boolean;
  responseTime: number;
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
}

export const SimulatorPanel = memo(function SimulatorPanel({
  scenarios,
  send,
}: {
  scenarios: ScenarioInfo[];
  send: (msg: Record<string, unknown>) => void;
}) {
  const [results, setResults] = useState<SimResult[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Real, deterministic results streamed back from the headless backend run.
  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent).detail;
      if (m.type === "sim_result") {
        setRunning(null);
        setProgress(100);
        if (m.error) return;
        const r: SimResult = {
          scenario: m.scenario,
          scenarioName: m.scenarioName ?? m.scenario,
          peakRisk: m.peakRisk,
          baselinePeakRisk: m.baselinePeakRisk,
          reductionPct: m.reductionPct,
          totalEvacuated: m.totalEvacuated,
          peakTide: m.peakTide,
          blockedRoads: m.blockedRoads,
          hospitalOverload: m.hospitalOverload,
          responseTime: m.responseTime,
          grade: m.grade,
          summary: m.summary,
        };
        setResults((prev) => {
          const idx = prev.findIndex((x) => x.scenario === r.scenario);
          if (idx >= 0) { const c = [...prev]; c[idx] = r; return c; }
          return [...prev, r];
        });
      }
    };
    window.addEventListener("yaqzan_ws", handler);
    return () => window.removeEventListener("yaqzan_ws", handler);
  }, []);

  // The headless run finishes in well under a second; the progress bar is a
  // brief affordance, not a fake delay. Real metrics replace it on sim_result.
  const runSimulation = (scenarioId: string) => {
    setRunning(scenarioId);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((p) => (p >= 90 ? 90 : p + 12));
    }, 120);
    setTimeout(() => clearInterval(interval), 2000);
    send({ cmd: "run_simulation", scenario: scenarioId });
  };

  const gradeColor: Record<string, string> = {
    A: "var(--ok)", B: "#5ba0e8", C: "var(--danger)", D: "var(--danger-hot)", F: "var(--danger-hot)",
  };

  return (
    <div className="flex h-full flex-col">
      <DashHeader title="SITUATION SIMULATOR" subtitle="Preparedness analysis & scenario comparison"
        right={
          <span className="flex items-center gap-1.5 rounded bg-[rgba(140,160,200,0.1)] px-2 py-1 text-[8.5px] font-bold tracking-wider text-[var(--ink-dim)]"
            title="Each run executes the full simulation engine headless with a fixed seed. Numbers are deterministic — re-run any scenario and you get identical results.">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 12a8 8 0 018-8 8 8 0 017 4M20 12a8 8 0 01-8 8 8 8 0 01-7-4" /><path d="M16 4h4v4M8 20H4v-4" /></svg>
            DETERMINISTIC ENGINE RUN
          </span>
        }
      />
      <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
        {/* Prompt-to-disaster designer */}
        <DisasterDesigner send={send} />

        {/* Scenario selection */}
        <div className="mb-5">
          <div className="label-caps mb-3" style={{ fontSize: 8 }}>AVAILABLE SCENARIOS</div>
          <div className="space-y-2">
            {scenarios.map((s) => {
              const isRunning = running === s.id;
              const hasResult = results.some((r) => r.scenario === s.id);
              return (
                <div key={s.id} className="rounded-xl border border-[var(--hairline)] bg-[var(--bg-inset)] px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="display text-[12px] font-semibold text-[var(--ink-bright)]">{s.name}</span>
                      <span className="mono text-[8px] text-[var(--ink-faint)]">{s.inject_count} injects · {s.max_ticks} ticks</span>
                    </div>
                    <button
                      onClick={() => runSimulation(s.id)}
                      disabled={isRunning}
                      className={`pill px-3 py-1 text-[9px] font-semibold transition-all ${
                        isRunning
                          ? "bg-[var(--brand-soft)] text-[var(--brand)] animate-pulse"
                          : hasResult
                            ? "border border-[var(--hairline-active)] bg-[var(--bg-raised)] text-[var(--ink)] hover:border-[var(--brand-line)] hover:text-[var(--brand)]"
                            : "bg-[var(--brand-soft)] text-[var(--brand)] hover:bg-[var(--brand)] hover:text-white"
                      }`}
                    >
                      {isRunning ? "Running…" : hasResult ? "Re-run" : "Simulate"}
                    </button>
                  </div>
                  <p className="text-[10px] text-[var(--ink-dim)] leading-snug">{s.description.slice(0, 120)}…</p>
                  {isRunning && (
                    <div className="mt-2">
                      <ProgressBar value={Math.min(progress, 100)} color="var(--brand)" height={3} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div>
            <div className="label-caps mb-3" style={{ fontSize: 8 }}>SIMULATION RESULTS</div>
            <div className="space-y-4">
              {results.map((r) => (
                <div key={r.scenario} className="rounded-xl border border-[var(--hairline)] bg-[var(--bg-inset)] overflow-hidden">
                  {/* Header with grade */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--hairline)]">
                    <span className="display text-[12px] font-semibold text-[var(--ink-bright)]">{r.scenarioName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-[var(--ink-dim)]">PREPAREDNESS</span>
                      <span className="display text-[20px] font-bold" style={{ color: gradeColor[r.grade] }}>
                        {r.grade}
                      </span>
                    </div>
                  </div>
                  {/* Headline: the commander's measured effect vs doing nothing */}
                  <div className="flex items-stretch gap-2 px-4 pt-3">
                    <div className="flex-1 rounded-lg border border-[var(--hairline)] bg-[var(--bg-raised)] px-3 py-2">
                      <div className="text-[7px] tracking-[0.15em] uppercase text-[var(--ink-faint)] mb-0.5">No response (baseline)</div>
                      <div className="display text-[16px] font-bold tabular-nums" style={{ color: "var(--danger-hot)" }}>
                        {r.baselinePeakRisk.toLocaleString()}
                      </div>
                      <div className="text-[8px] text-[var(--ink-faint)]">peak at risk</div>
                    </div>
                    <div className="flex flex-col items-center justify-center px-1">
                      <span className="display text-[15px] font-bold" style={{ color: "var(--ok)" }}>−{r.reductionPct}%</span>
                      <span className="text-[7px] tracking-[0.12em] uppercase text-[var(--ink-faint)]">managed</span>
                    </div>
                    <div className="flex-1 rounded-lg border border-[var(--ok)] bg-[var(--ok-dim)] px-3 py-2">
                      <div className="text-[7px] tracking-[0.15em] uppercase text-[var(--ink-faint)] mb-0.5">Standard response</div>
                      <div className="display text-[16px] font-bold tabular-nums" style={{ color: "var(--ok)" }}>
                        {r.peakRisk.toLocaleString()}
                      </div>
                      <div className="text-[8px] text-[var(--ink-faint)]">peak at risk</div>
                    </div>
                  </div>
                  {/* Supporting metrics */}
                  <div className="grid grid-cols-3 gap-2 px-4 py-3">
                    <MiniMetric label="Evacuated" value={r.totalEvacuated.toLocaleString()} color="var(--ok)" />
                    <MiniMetric label="Response" value={`t+${r.responseTime}`}
                      color={r.responseTime > 6 ? "var(--danger)" : "var(--ok)"} />
                    <MiniMetric label="Peak Tide" value={`${r.peakTide.toFixed(1)}m`} color="var(--water)" />
                    <MiniMetric label="Roads Down" value={String(r.blockedRoads)}
                      color={r.blockedRoads > 15 ? "var(--danger-hot)" : "var(--ink-bright)"} />
                    <MiniMetric label="Hospital"
                      value={r.hospitalOverload ? "OVERLOADED" : "OK"}
                      color={r.hospitalOverload ? "var(--danger-hot)" : "var(--ok)"} />
                    <MiniMetric label="Lives Shielded" value={(r.baselinePeakRisk - r.peakRisk).toLocaleString()} color="var(--ok)" />
                  </div>
                  {/* Summary */}
                  <div className="px-4 py-3 border-t border-[var(--hairline)]">
                    <p className="text-[10px] text-[var(--ink-dim)] leading-relaxed">{r.summary}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Comparison (if 2+ results) */}
            {results.length >= 2 && (
              <div className="mt-5">
                <div className="label-caps mb-3" style={{ fontSize: 8 }}>SCENARIO COMPARISON</div>
                <div className="rounded-xl border border-[var(--hairline)] bg-[var(--bg-inset)] overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[var(--hairline)] text-[8px] tracking-[0.18em] uppercase text-[var(--ink-faint)]">
                        <th className="px-3 py-2 font-medium">Scenario</th>
                        <th className="px-3 py-2 font-medium text-right">Grade</th>
                        <th className="px-3 py-2 font-medium text-right">Peak Risk</th>
                        <th className="px-3 py-2 font-medium text-right">Evacuated</th>
                        <th className="px-3 py-2 font-medium text-right">Response</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.scenario} className="border-t border-[var(--hairline)]">
                          <td className="px-3 py-2 text-[11px] text-[var(--ink)]">{r.scenarioName}</td>
                          <td className="px-3 py-2 text-right">
                            <span className="display text-[14px] font-bold" style={{ color: gradeColor[r.grade] }}>{r.grade}</span>
                          </td>
                          <td className="px-3 py-2 text-right mono text-[10px] text-[var(--ink-dim)]">{r.peakRisk.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right mono text-[10px] text-[var(--ok)]">{r.totalEvacuated.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right mono text-[10px] text-[var(--ink-dim)]">{r.responseTime}t</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

function MiniMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-[7px] tracking-[0.15em] uppercase text-[var(--ink-faint)] mb-0.5">{label}</div>
      <div className="display text-[14px] font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

