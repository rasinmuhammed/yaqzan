import { AnimatePresence, motion } from "framer-motion";
import { memo } from "react";
import { ActionIcon, StatusDot } from "./Icons";
import type { Cycle, Directive, Plan } from "../types";

const URG_STYLE: Record<string, { bg: string; border: string; accent: string }> = {
  immediate: {
    bg: "rgba(220,38,38,0.04)",
    border: "rgba(220,38,38,0.18)",
    accent: "var(--danger-hot)",
  },
  high: {
    bg: "rgba(217,119,6,0.03)",
    border: "rgba(217,119,6,0.15)",
    accent: "var(--danger)",
  },
  routine: {
    bg: "rgba(140,160,200,0.02)",
    border: "rgba(140,160,200,0.08)",
    accent: "var(--ink-dim)",
  },
};

/** Highlight entity references in rationale text */
function renderRationale(text: string, onHover: (id: string | null) => void) {
  const parts = text.split(/((?:node|unit|edge):\S+)/g);
  return parts.map((p, i) => {
    const m = p.match(/^(node|unit|edge):(\S+)$/);
    if (m) {
      const [, kind, id] = m;
      return (
        <span key={i} className={`entity-chip ${kind}`}
          onMouseEnter={() => onHover(id.replace(/[.,;:]+$/, ""))}
          onMouseLeave={() => onHover(null)}>
          {p}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export const PlanPanel = memo(function PlanPanel({
  cycles,
  overridden,
  applied = new Set<string>(),
  authority = "delegated",
  onOverride,
  onAccept,
  onAcceptAll,
  onHover,
}: {
  cycles: Cycle[];
  overridden: Set<string>;
  applied?: Set<string>;
  authority?: "supervised" | "delegated";
  onOverride: (cycle: number, id: string) => void;
  onAccept?: (cycle: number, id: string) => void;
  onAcceptAll?: (cycle: number) => void;
  onHover: (id: string | null) => void;
}) {
  const withPlan = cycles.filter((c) => c.plan);
  const latest = withPlan[withPlan.length - 1];

  if (!latest?.plan) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--hairline)] bg-[var(--bg-inset)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        </div>
        <span className="label-caps">Situation Report</span>
        <span className="text-[11px] text-[var(--ink-dim)]">
          No briefing yet — awaiting the next AI summary…
        </span>
      </div>
    );
  }

  const plan = latest.plan;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--hairline)] px-4 py-2">
        <span className="label-caps">Situation Report</span>
        <div className="flex items-center gap-2 text-[10px] text-[var(--ink-dim)]">
          <span className="mono">cycle {plan.cycle}</span>
          <span>·</span>
          <span>{plan.directives.length} directives</span>
          <span>·</span>
          <ConfBadge confidence={plan.confidence} />
          {authority === "supervised" &&
            plan.directives.some(
              (d) => d.verified && !applied.has(`${plan.cycle}:${d.id}`) && !overridden.has(`${plan.cycle}:${d.id}`)
            ) && (
              <button
                onClick={() => onAcceptAll?.(plan.cycle)}
                className="pill ml-1 border border-[var(--ok)] bg-[var(--ok-dim)] px-2.5 py-[2px] text-[9px] font-bold tracking-wider text-[var(--ok)] transition-colors hover:bg-[var(--ok)] hover:text-white"
              >
                ACCEPT ALL
              </button>
            )}
        </div>
      </div>

      {/* Situation read */}
      <div className="border-b border-[var(--hairline)] px-4 py-2.5 text-[11px] leading-relaxed text-[var(--ink-dim)]">
        {plan.situation_read}
      </div>

      {/* Directives */}
      <div className="scroll-thin flex-1 overflow-y-auto px-3 py-2">
        <AnimatePresence mode="popLayout">
          {plan.directives.map((d, i) => (
            <motion.div
              key={`${plan.cycle}-${d.id}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <DirectiveCard
                directive={d}
                cycle={plan.cycle}
                isOverridden={overridden.has(`${plan.cycle}:${d.id}`)}
                isApplied={applied.has(`${plan.cycle}:${d.id}`)}
                needsApproval={authority === "supervised"}
                onOverride={() => onOverride(plan.cycle, d.id)}
                onAccept={() => onAccept?.(plan.cycle, d.id)}
                onHover={onHover}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Watching section */}
        {plan.watching.length > 0 && (
          <div className="mt-3 border-t border-[var(--hairline)] pt-2.5">
            <span className="label-caps mb-1.5 block" style={{ fontSize: 8 }}>MONITORING NEXT CYCLE</span>
            <div className="space-y-1">
              {plan.watching.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px] leading-snug text-[var(--ink-dim)]">
                  <span className="shrink-0 text-[var(--ink-faint)]">◆</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

function DirectiveCard({
  directive: d,
  cycle,
  isOverridden,
  isApplied,
  needsApproval,
  onOverride,
  onAccept,
  onHover,
}: {
  directive: Directive;
  cycle: number;
  isOverridden: boolean;
  isApplied: boolean;
  needsApproval: boolean;
  onOverride: () => void;
  onAccept: () => void;
  onHover: (id: string | null) => void;
}) {
  const urg = URG_STYLE[d.urgency] ?? URG_STYLE.routine;
  const rejected = d.verified === false;
  const verified = d.verified === true;

  return (
    <div
      className={`group mb-2 rounded-xl border px-3.5 py-2.5 transition-all ${isOverridden ? "opacity-35" : ""}`}
      style={{
        background: rejected
          ? "rgba(220,38,38,0.03)"
          : urg.bg,
        borderColor: rejected
          ? "rgba(220,38,38,0.2)"
          : urg.border,
      }}
      onMouseEnter={() => onHover(d.target)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Header row */}
      <div className="mb-1 flex items-center gap-2">
        <ActionIcon action={d.action} size={14}
          className={rejected ? "text-[var(--danger-hot)]" : `text-[${urg.accent}]`}
          style={{ color: rejected ? "var(--danger-hot)" : urg.accent }}
        />
        <span className="display text-[11px] font-bold tracking-wide text-[var(--ink-bright)]">
          {d.action.replace(/_/g, " ").toUpperCase()}
        </span>
        <span className="text-[10px] text-[var(--ink-dim)]">→</span>
        <span className="entity-chip node text-[10px]"
          onMouseEnter={() => onHover(d.target)} onMouseLeave={() => onHover(null)}>
          {d.target}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="pill px-1.5 py-[1px] text-[8px] font-bold uppercase"
            style={{ background: urg.bg, color: urg.accent, border: `1px solid ${urg.border}` }}>
            {d.urgency}
          </span>
          {verified && <StatusDot tone="ok" />}
          {rejected && <StatusDot tone="rejected" />}
          {d.verified === null && <StatusDot tone="pending" />}
        </div>
      </div>

      {/* Rationale */}
      <div className="text-[10.5px] leading-relaxed text-[var(--ink-dim)]">
        {renderRationale(d.rationale, onHover)}
      </div>

      {/* Rejection banner */}
      {rejected && d.rejection_reason && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-[rgba(220,38,38,0.15)] bg-[rgba(220,38,38,0.04)] px-2.5 py-1.5 text-[10px] text-[var(--danger-hot)]">
          <span className="shrink-0 font-bold"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>
          <span>{d.rejection_reason}</span>
        </div>
      )}

      {/* Human-in-the-loop controls */}
      {verified && !isOverridden && isApplied && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[9px] font-bold tracking-wider text-[var(--ok)]">
          <span className="h-[5px] w-[5px] animate-pulse rounded-full bg-[var(--ok)]" />
          EXECUTING
        </div>
      )}
      {verified && !isOverridden && !isApplied && needsApproval && (
        <div className="mt-2 flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onAccept(); }}
            className="pill border border-[var(--ok)] bg-[var(--ok-dim)] px-3 py-1 text-[9px] font-bold tracking-wider text-[var(--ok)] transition-colors hover:bg-[var(--ok)] hover:text-white flex items-center gap-1"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
            ACCEPT
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onOverride(); }}
            className="pill border border-[rgba(220,38,38,0.25)] px-3 py-1 text-[9px] font-semibold tracking-wider text-[var(--danger-hot)] transition-colors hover:bg-[rgba(220,38,38,0.1)] flex items-center gap-1"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            REJECT
          </button>
          <span className="ml-1 text-[8.5px] tracking-wide text-[var(--ink-faint)]">
            awaiting operator
          </span>
        </div>
      )}
      {verified && !isOverridden && !isApplied && !needsApproval && (
        <button
          onClick={(e) => { e.stopPropagation(); onOverride(); }}
          className="mt-1.5 rounded-md border border-[rgba(220,38,38,0.15)] bg-[rgba(220,38,38,0.04)] px-2 py-1 text-[9px] font-semibold tracking-wider text-[var(--danger-hot)] opacity-0 transition-all group-hover:opacity-100 hover:bg-[rgba(220,38,38,0.1)]"
        >
          OVERRIDE
        </button>
      )}
      {isOverridden && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[9px] tracking-wider text-[var(--ink-dim)]">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--danger-hot)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          <span>Rejected by operator</span>
        </div>
      )}
    </div>
  );
}

function ConfBadge({ confidence }: { confidence: string }) {
  const c: Record<string, { color: string; bg: string }> = {
    high: { color: "var(--ok)", bg: "var(--ok-dim)" },
    medium: { color: "var(--danger)", bg: "rgba(217,119,6,0.08)" },
    low: { color: "var(--danger-hot)", bg: "rgba(220,38,38,0.08)" },
  };
  const s = c[confidence] ?? c.medium;
  return (
    <span className="pill px-2 py-[1px] text-[9px] font-bold uppercase"
      style={{ background: s.bg, color: s.color }}>
      {confidence}
    </span>
  );
}
