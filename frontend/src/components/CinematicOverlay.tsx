import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { Snapshot } from "../types";

const SEV_LABEL: Record<string, { text: string; color: string }> = {
  normal: { text: "CONDITION NORMAL", color: "var(--ok)" },
  elevated: { text: "CONDITION ELEVATED", color: "var(--danger)" },
  critical: { text: "CONDITION CRITICAL", color: "var(--danger-hot)" },
  extreme: { text: "CONDITION EXTREME", color: "#ff3333" },
};

const SEV_ICON: Record<string, string> = {
  critical: "▲",
  high: "▲",
  medium: "●",
  low: "○",
};

interface InjectBanner {
  id: string;
  severity: string;
  headline: string;
  tick: number;
}

export function CinematicOverlay({
  snapshot,
  latestInject,
  film,
}: {
  snapshot: Snapshot | null;
  latestInject: InjectBanner | null;
  film: boolean;
}) {
  const [showInject, setShowInject] = useState<InjectBanner | null>(null);
  const [prevInjectId, setPrevInjectId] = useState<string | null>(null);
  const sev = snapshot?.severity_level ?? "normal";

  useEffect(() => {
    if (latestInject && latestInject.id !== prevInjectId) {
      setPrevInjectId(latestInject.id);
      setShowInject(latestInject);
      const timer = setTimeout(() => setShowInject(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [latestInject, prevInjectId]);

  return (
    <>
      {/* Severity edge glow — always visible */}
      <div className={`severity-glow ${sev}`} />

      {/* Inject announcement banner */}
      <AnimatePresence>
        {showInject && (
          <motion.div
            key={showInject.id}
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed left-0 right-0 top-0 z-[60] flex items-center justify-center"
            style={{ pointerEvents: "none" }}
          >
            <div
              className="mx-auto mt-3 flex max-w-[680px] items-center gap-4 rounded-xl px-6 py-4"
              style={{
                background:
                  showInject.severity === "critical"
                    ? "linear-gradient(135deg, rgba(220,38,38,0.18), rgba(220,38,38,0.06))"
                    : showInject.severity === "high"
                      ? "linear-gradient(135deg, rgba(217,119,6,0.16), rgba(217,119,6,0.05))"
                      : "linear-gradient(135deg, rgba(140,160,200,0.10), rgba(140,160,200,0.04))",
                border: `1px solid ${
                  showInject.severity === "critical"
                    ? "rgba(220,38,38,0.35)"
                    : showInject.severity === "high"
                      ? "rgba(217,119,6,0.30)"
                      : "rgba(140,160,200,0.15)"
                }`,
                backdropFilter: "blur(20px)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
              }}
            >
              <span
                className="display text-[22px] font-bold"
                style={{
                  color:
                    showInject.severity === "critical"
                      ? "var(--danger-hot)"
                      : showInject.severity === "high"
                        ? "var(--danger)"
                        : "var(--ink-dim)",
                }}
              >
                {SEV_ICON[showInject.severity] ?? "●"}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className="label-caps mb-0.5"
                  style={{
                    color:
                      showInject.severity === "critical"
                        ? "var(--danger-hot)"
                        : "var(--danger)",
                    fontSize: 9,
                  }}
                >
                  {showInject.severity === "critical" ? "CRITICAL INJECT" : "SCENARIO INJECT"} · T
                  {showInject.tick}
                </div>
                <div className="display text-[14px] font-semibold leading-snug text-[var(--ink-bright)]">
                  {showInject.headline}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Film mode: severity strip at top when no inject banner */}
      {film && !showInject && snapshot && (
        <div className="fixed left-0 right-0 top-0 z-[55] flex justify-center" style={{ pointerEvents: "none" }}>
          <div
            className="mt-2 flex items-center gap-2.5 rounded-full px-4 py-1.5"
            style={{
              background: "rgba(12, 15, 20, 0.75)",
              border: `1px solid ${sev === "extreme" || sev === "critical" ? "rgba(220,38,38,0.25)" : "rgba(140,160,200,0.08)"}`,
              backdropFilter: "blur(12px)",
            }}
          >
            <span
              className="h-[6px] w-[6px] rounded-full"
              style={{
                background: SEV_LABEL[sev]?.color ?? "var(--ink-dim)",
                boxShadow: `0 0 8px ${SEV_LABEL[sev]?.color ?? "transparent"}`,
                animation: sev === "extreme" || sev === "critical" ? "live-pulse 1.5s ease-in-out infinite" : "none",
              }}
            />
            <span
              className="display text-[10px] font-bold tracking-[0.2em]"
              style={{ color: SEV_LABEL[sev]?.color ?? "var(--ink-dim)" }}
            >
              {SEV_LABEL[sev]?.text ?? ""}
            </span>
            <span className="mono text-[10px] text-[var(--ink-dim)]">T{snapshot.tick}</span>
          </div>
        </div>
      )}
    </>
  );
}

/** Startup splash for film mode — fades in city name, then "K2 Active" */
export function StartupSplash({ cityName, onDone }: { cityName: string; onDone: () => void }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 800);
    const t2 = setTimeout(() => setPhase(2), 2000);
    const t3 = setTimeout(() => setPhase(3), 3200);
    const t4 = setTimeout(() => onDone(), 4000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onDone]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ background: "var(--bg)" }}
      animate={{ opacity: phase >= 3 ? 0 : 1 }}
      transition={{ duration: 0.8 }}
    >
      <AnimatePresence>
        {phase >= 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="display text-center"
          >
            <div className="text-[11px] font-semibold tracking-[0.5em] text-[var(--ink-dim)]">
              AI INCIDENT COMMANDER
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {phase >= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mt-4 flex items-center justify-center gap-4 display text-[36px] font-bold tracking-[0.15em] text-[var(--ink-bright)]"
          >
            <img src="/yaqzan-logo.png" alt="" className="h-12 w-12 object-contain" style={{ filter: "brightness(1.1)" }} />
            <div>
              YAQZAN
              <span className="ml-3 text-[28px] font-medium text-[var(--brand)]">يقظان</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {phase >= 2 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="mt-6 flex items-center gap-2"
          >
            <span
              className="h-[6px] w-[6px] rounded-full live-dot"
              style={{ background: "var(--brand)", color: "var(--brand)" }}
            />
            <span className="display text-[11px] font-semibold tracking-[0.3em] text-[var(--brand)]">
              K2 THINK V2 ACTIVE
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {phase >= 2 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="mt-3 text-[12px] tracking-wider text-[var(--ink-dim)]"
          >
            {cityName} · Coastal Flood Emergency
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
