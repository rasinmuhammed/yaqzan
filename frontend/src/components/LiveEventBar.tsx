import { useEffect, useState } from "react";

/* ═══════════════════════════════════════════════════════════════════
   LIVE EVENT INJECTOR — break the world in plain language. K2 interprets
   the operator's free text into real simulation effects, applies them
   live, and the commander must replan. Adaptive reasoning on demand.
   ═══════════════════════════════════════════════════════════════════ */

type Send = (msg: Record<string, unknown>) => void;
type Phase = "idle" | "interpreting" | "applied" | "failed";

const Bolt = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13z" />
  </svg>
);

const PRESETS = [
  "A bund just collapsed at Pandanad",
  "Power is out across Kavalam and Champakulam",
  "Chemical spill reported near Punnapra",
  "Mobile networks are failing in the polders",
];

export function LiveEventBar({ send }: { send: Send }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent).detail;
      if (m.type === "live_event_started") { setPhase("interpreting"); setStatus("K2 is interpreting the event…"); }
      else if (m.type === "live_event_applied") { setPhase("applied"); setStatus(`Applied: ${m.headline}. Commander will replan.`); setTimeout(() => setPhase("idle"), 5000); }
      else if (m.type === "live_event_failed") { setPhase("failed"); setStatus(`Could not apply: ${m.error}`); setTimeout(() => setPhase("idle"), 6000); }
    };
    window.addEventListener("yaqzan_ws", handler);
    return () => window.removeEventListener("yaqzan_ws", handler);
  }, []);

  const fire = (t: string) => {
    const v = t.trim();
    if (!v || phase === "interpreting") return;
    send({ cmd: "live_event", text: v });
    setText(""); setPhase("interpreting"); setStatus("K2 is interpreting the event…");
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="pill flex items-center gap-1.5 border border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.08)] px-2.5 py-[3px] text-[9px] font-bold tracking-[0.08em] text-[var(--danger-hot)] transition-colors hover:bg-[var(--danger-hot)] hover:text-white"
        title="Throw a live curveball; K2 interprets and the commander adapts">
        <Bolt /> INJECT EVENT
      </button>
    );
  }

  return (
    <div className="absolute right-3 top-12 z-[1500] w-[360px] overflow-hidden rounded-xl border border-[rgba(220,38,38,0.3)] bg-[rgba(12,16,22,0.97)] shadow-[0_16px_48px_rgba(0,0,0,0.6)] backdrop-blur">
      <div className="flex items-center gap-2 border-b border-[var(--hairline)] bg-[rgba(220,38,38,0.06)] px-3.5 py-2.5">
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-md bg-[rgba(220,38,38,0.14)] text-[var(--danger-hot)]"><Bolt size={11} /></span>
        <div className="flex flex-col leading-tight">
          <span className="text-[9.5px] font-bold tracking-[0.12em] text-[var(--danger-hot)]">LIVE EVENT INJECTION</span>
          <span className="text-[8px] text-[var(--ink-faint)]">K2 interprets it and the commander adapts</span>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close"
          className="ml-auto flex h-[20px] w-[20px] items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--bg-inset)] hover:text-[var(--ink)]">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <div className="px-3.5 py-3">
        <div className="flex items-center gap-2">
          <input
            autoFocus value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fire(text)}
            placeholder="Describe a new event in plain language"
            disabled={phase === "interpreting"}
            className="flex-1 rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)] px-3 py-2 text-[11px] text-[var(--ink)] outline-none transition-colors focus:border-[rgba(220,38,38,0.4)]"
          />
          <button onClick={() => fire(text)} disabled={!text.trim() || phase === "interpreting"}
            className={`pill px-3.5 py-2 text-[10px] font-bold tracking-wider transition-all ${
              phase === "interpreting" ? "animate-pulse bg-[rgba(220,38,38,0.15)] text-[var(--danger-hot)]"
                : "bg-[var(--danger-hot)] text-white hover:opacity-85 disabled:opacity-30"}`}>
            INJECT
          </button>
        </div>
        {phase === "idle" && (
          <>
            <div className="mt-2.5 mb-1.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">Try one</div>
            <div className="flex flex-col gap-1">
              {PRESETS.map((p, i) => (
                <button key={i} onClick={() => fire(p)}
                  className="group flex items-center gap-2 rounded-md border border-[var(--hairline)] bg-[var(--bg-inset)] px-2.5 py-1.5 text-left text-[10px] text-[var(--ink-dim)] transition-colors hover:border-[rgba(220,38,38,0.3)] hover:text-[var(--danger-hot)]">
                  <span className="text-[var(--ink-faint)] transition-colors group-hover:text-[var(--danger-hot)]"><Bolt size={9} /></span>
                  {p}
                </button>
              ))}
            </div>
          </>
        )}
        {phase !== "idle" && (
          <div className="mt-2.5 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px]"
            style={{
              color: phase === "applied" ? "var(--ok)" : phase === "failed" ? "var(--danger-hot)" : "var(--ink-dim)",
              borderColor: phase === "applied" ? "var(--ok)" : phase === "failed" ? "rgba(220,38,38,0.3)" : "var(--hairline)",
              background: phase === "applied" ? "var(--ok-dim)" : phase === "failed" ? "rgba(220,38,38,0.05)" : "var(--bg-inset)",
            }}>
            {phase === "interpreting" && <span className="h-[5px] w-[5px] animate-pulse rounded-full bg-[var(--danger-hot)]" />}
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
