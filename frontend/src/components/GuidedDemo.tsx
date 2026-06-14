import { useEffect, useRef, useState } from "react";
import type { SidebarTab } from "./Sidebar";

/* ═══════════════════════════════════════════════════════════════════
   GUIDED DEMO — a scripted, narrated walkthrough of the full loop so a
   first-time viewer (judge) sees the story without exploring blindly.
   Each beat switches to the relevant tab, optionally drives the sim, and
   explains what to watch. Auto-advances; fully manual controls too.
   ═══════════════════════════════════════════════════════════════════ */

type Send = (msg: Record<string, unknown>) => void;
interface Beat { tab: SidebarTab; title: string; body: string; action?: (send: Send) => void; secs?: number; }

const BEATS: Beat[] = [
  {
    tab: "overview", title: "A fictional drill on the real Kuttanad",
    body: "This is the real Alappuzha district — towns, roads and elevation from OpenStreetMap and NASA — modelled on the 2018 Kerala floods that displaced a million people. Watch an AI command the response.",
    action: (send) => { send({ cmd: "reset" }); setTimeout(() => { send({ cmd: "set_authority", mode: "supervised" }); send({ cmd: "set_speed", seconds: 1.5 }); send({ cmd: "start" }); }, 600); },
    secs: 11,
  },
  {
    tab: "roads", title: "The flood is terrain-driven",
    body: "Look at the centre map: water pools first in the below-sea-level polders — a continuous flood surface computed over real elevation, with rescue boats and ferries on the real road network. Not dots on a diagram.",
    secs: 10,
  },
  {
    tab: "commander", title: "K2 Think reasons out loud",
    body: "The commander reads the live situation and streams its full chain-of-thought. The reasoning IS the product — every decision is legible and auditable in real time.",
    secs: 11,
  },
  {
    tab: "commander", title: "Grounded, verified, yours to approve",
    body: "Each directive is checked against the real world — a blocked road or flooded shelter is rejected — and waits for your approval. The AI advises; the human commands.",
    secs: 10,
  },
  {
    tab: "reports", title: "Citizens report; the agent responds",
    body: "A citizen just reported a stranded family in Champakulam. K2 triages it live and recommends a concrete, verified rescue operation you can dispatch with one click.",
    action: (send) => send({ cmd: "citizen_report", report: { type: "Stranded People", location: "Champakulam", description: "A family stranded on a rooftop in Champakulam, water rising fast, two small children and an injured man." } }),
    secs: 13,
  },
  {
    tab: "overview", title: "Measured against ground truth",
    body: "Every run is scored against a no-AI baseline. The gap — lives kept out of danger — is the commander's measured effect, not a claim.",
    secs: 10,
  },
  {
    tab: "simulator", title: "Now it's yours",
    body: "Speak any disaster into existence in the Simulator and K2 will design it, then command the response. Or close this and explore freely.",
    secs: 10,
  },
];

export function GuidedDemo({ onExit, setTab, send }: { onExit: () => void; setTab: (t: SidebarTab) => void; send: Send }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const beat = BEATS[i];
  const firedFor = useRef(-1);

  // Run the beat's tab switch + side effect once when it becomes active.
  useEffect(() => {
    setTab(beat.tab);
    if (firedFor.current !== i) { firedFor.current = i; beat.action?.(send); }
    setProgress(0);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance progress bar.
  useEffect(() => {
    if (!playing) return;
    const dur = (beat.secs ?? 10) * 1000;
    const t0 = Date.now();
    const iv = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / dur);
      setProgress(p);
      if (p >= 1) { clearInterval(iv); if (i < BEATS.length - 1) setI(i + 1); else setPlaying(false); }
    }, 80);
    return () => clearInterval(iv);
  }, [i, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pointer-events-none fixed inset-0 z-[2000] flex items-end justify-center pb-6">
      <div className="pointer-events-auto w-[min(620px,92vw)] rounded-2xl border border-[var(--brand-line)] bg-[rgba(12,16,22,0.96)] px-5 py-4 shadow-[0_12px_48px_rgba(0,0,0,0.6)] backdrop-blur">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-[18px] items-center rounded-full bg-[var(--brand-soft)] px-2 text-[8.5px] font-bold tracking-[0.15em] text-[var(--brand)]">
            GUIDED DEMO
          </span>
          <span className="mono text-[10px] text-[var(--ink-faint)]">{i + 1} / {BEATS.length}</span>
          <div className="ml-auto flex items-center gap-1">
            {BEATS.map((_, k) => (
              <span key={k} className="h-[3px] w-[14px] overflow-hidden rounded-full bg-[var(--bg-inset)]">
                <span className="block h-full bg-[var(--brand)]"
                  style={{ width: k < i ? "100%" : k === i ? `${progress * 100}%` : "0%" }} />
              </span>
            ))}
          </div>
        </div>
        <div className="display text-[16px] font-bold text-[var(--ink-bright)]">{beat.title}</div>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-dim)]">{beat.body}</p>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}
            className="pill border border-[var(--hairline)] px-3 py-1.5 text-[10px] text-[var(--ink-dim)] transition-colors hover:text-[var(--ink)] disabled:opacity-30">
            Back
          </button>
          <button onClick={() => setPlaying((p) => !p)}
            className="pill border border-[var(--hairline)] px-3 py-1.5 text-[10px] text-[var(--ink-dim)] transition-colors hover:text-[var(--ink)]">
            {playing ? "Pause" : "Play"}
          </button>
          {i < BEATS.length - 1 ? (
            <button onClick={() => setI(i + 1)}
              className="pill ml-auto border border-[var(--brand-line)] bg-[var(--brand-soft)] px-4 py-1.5 text-[10px] font-bold text-[var(--brand)] transition-colors hover:bg-[var(--brand)] hover:text-white">
              Next →
            </button>
          ) : (
            <button onClick={onExit}
              className="pill ml-auto border border-[var(--ok)] bg-[var(--ok-dim)] px-4 py-1.5 text-[10px] font-bold text-[var(--ok)] transition-colors hover:bg-[var(--ok)] hover:text-white">
              Explore freely →
            </button>
          )}
          <button onClick={onExit} className="text-[10px] text-[var(--ink-faint)] hover:text-[var(--ink-dim)]">Exit</button>
        </div>
      </div>
    </div>
  );
}
