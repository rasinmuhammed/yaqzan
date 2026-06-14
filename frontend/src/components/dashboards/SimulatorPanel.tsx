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

  // Listen for simulator results from WebSocket
  // For now, we use mock data to demonstrate the UI
  const runSimulation = (scenarioId: string) => {
    setRunning(scenarioId);
    setProgress(0);

    // Animate progress
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          return 100;
        }
        return p + Math.random() * 15;
      });
    }, 200);

    // Simulate completion after ~2s
    setTimeout(() => {
      clearInterval(interval);
      setProgress(100);
      setRunning(null);

      const scenario = scenarios.find((s) => s.id === scenarioId);
      const mockResult: SimResult = {
        scenario: scenarioId,
        scenarioName: scenario?.name ?? scenarioId,
        peakRisk: Math.floor(8000 + Math.random() * 15000),
        totalEvacuated: Math.floor(3000 + Math.random() * 8000),
        peakTide: 1.5 + Math.random() * 3,
        blockedRoads: Math.floor(5 + Math.random() * 20),
        hospitalOverload: Math.random() > 0.4,
        responseTime: Math.floor(3 + Math.random() * 8),
        grade: ["A", "B", "C", "D"][Math.floor(Math.random() * 4)] as SimResult["grade"],
        summary: generateSummary(scenario?.name ?? ""),
      };

      setResults((prev) => {
        // Replace if same scenario
        const idx = prev.findIndex((r) => r.scenario === scenarioId);
        if (idx >= 0) { const c = [...prev]; c[idx] = mockResult; return c; }
        return [...prev, mockResult];
      });

      // Send actual simulation command to backend
      send({ cmd: "run_simulation", scenario: scenarioId });
    }, 2500);
  };

  const gradeColor: Record<string, string> = {
    A: "var(--ok)", B: "#5ba0e8", C: "var(--danger)", D: "var(--danger-hot)", F: "var(--danger-hot)",
  };

  return (
    <div className="flex h-full flex-col">
      <DashHeader title="SITUATION SIMULATOR" subtitle="Preparedness analysis & scenario comparison" />
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
                  {/* Metrics */}
                  <div className="grid grid-cols-3 gap-2 px-4 py-3">
                    <MiniMetric label="Peak Risk" value={r.peakRisk.toLocaleString()}
                      color={r.peakRisk > 15000 ? "var(--danger-hot)" : "var(--danger)"} />
                    <MiniMetric label="Evacuated" value={r.totalEvacuated.toLocaleString()} color="var(--ok)" />
                    <MiniMetric label="Response" value={`${r.responseTime} ticks`}
                      color={r.responseTime > 6 ? "var(--danger)" : "var(--ok)"} />
                    <MiniMetric label="Peak Tide" value={`${r.peakTide.toFixed(1)}m`} color="var(--water)" />
                    <MiniMetric label="Roads Down" value={String(r.blockedRoads)}
                      color={r.blockedRoads > 15 ? "var(--danger-hot)" : "var(--ink-bright)"} />
                    <MiniMetric label="Hospital"
                      value={r.hospitalOverload ? "OVERLOADED" : "OK"}
                      color={r.hospitalOverload ? "var(--danger-hot)" : "var(--ok)"} />
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

function generateSummary(name: string): string {
  const summaries: Record<string, string> = {
    "Kuttanad Monsoon Deluge": "Twin monsoon pulses over the Pamba catchment overwhelmed the below-sea-level polders. Vandanam Medical College needed emergency generator support after the grid failed. Road links through Pandanad were lost, forcing boat-only evacuation of Champakulam and Kainakary. Recommend pre-staging boats at Nedumudy and opening Edathua and Chengannur relief camps ahead of the second crest.",
    "Pamba Night Dam Release": "An overnight reservoir release sent a fast surge into Chengannur and Pandanad with little warning. Darkness and collapsing mobile coverage made reaching trapped families the critical constraint. Key learning: pre-position rescue boats downstream of the dams and establish verified Malayalam-language alert channels before any night release.",
  };
  return summaries[name] ?? "Simulation complete. Analysis pending integration with K2 reasoning engine for detailed assessment.";
}
