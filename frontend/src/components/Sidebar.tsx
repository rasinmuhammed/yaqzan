import { memo, useState, type ReactNode } from "react";

/* ═══════════════════════════════════════════════════════════════════
   SIDEBAR — Vertical tab navigation for the command center.
   
   Design: Narrow icon rail (48px) + content area.
   Tabs switch between domain dashboards, AI reasoning, chat, and simulator.
   ═══════════════════════════════════════════════════════════════════ */

export type SidebarTab =
  | "commander"
  | "overview"
  | "roads"
  | "medical"
  | "comms"
  | "resources"
  | "district"
  | "reports"
  | "chat"
  | "simulator";

interface TabDef {
  id: SidebarTab;
  icon: ReactNode;
  label: string;
  shortcut?: string;
}

const ICON_SIZE = 18;

function SvgIcon({ d, size = ICON_SIZE }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const TABS: TabDef[] = [
  {
    id: "commander",
    label: "Situation Briefing",
    icon: <SvgIcon d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7zM9 21h6M10 17v4M14 17v4" />,
  },
  {
    id: "overview",
    label: "Overview",
    icon: <SvgIcon d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />,
  },
  {
    id: "roads",
    label: "Roads",
    icon: <SvgIcon d="M5 18h14M5 12h14M5 6h14M3 6l3-3 3 3M18 6l3-3M3 12l3-3M18 12l3-3 3 3" />,
  },
  {
    id: "medical",
    label: "Medical",
    icon: <SvgIcon d="M12 2v20M2 12h20M9 2h6M9 22h6M2 9v6M22 9v6" />,
  },
  {
    id: "comms",
    label: "911 / Comms",
    icon: <SvgIcon d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />,
  },
  {
    id: "resources",
    label: "Resources",
    icon: <SvgIcon d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10" />,
  },
  {
    id: "district",
    label: "Town",
    icon: <SvgIcon d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />,
  },
  {
    id: "chat",
    label: "Ask AI",
    icon: <SvgIcon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  },
  {
    id: "reports",
    label: "Reports",
    icon: <SvgIcon d="M19 4H5a2 2 0 0 0-2 2v14l4-4h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM12 11V7M12 13h.01" />,
  },
  {
    id: "simulator",
    label: "Simulator",
    icon: <SvgIcon d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  },
];

// Separator indices — draw a hairline after these tabs
// Three legible groups so a first-time viewer knows where to look.
const GROUPS: { label: string; ids: SidebarTab[] }[] = [
  { label: "CMD", ids: ["commander", "overview"] },
  { label: "OPS", ids: ["roads", "medical", "comms", "resources", "district"] },
  { label: "LIVE", ids: ["chat", "reports", "simulator"] },
];
const TAB_BY_ID = Object.fromEntries(TABS.map((t) => [t.id, t])) as Record<SidebarTab, TabDef>;

export const Sidebar = memo(function Sidebar({
  activeTab,
  onTabChange,
  children,
  badge,
}: {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  children: ReactNode;
  badge?: Partial<Record<SidebarTab, number | string>>;
}) {
  return (
    <div className="flex h-full overflow-hidden rounded-[14px] border border-[var(--hairline)] bg-[var(--bg-raised)]"
      style={{ backdropFilter: "blur(12px)", boxShadow: "var(--panel-shadow)" }}>
      {/* Tab rail, grouped into labelled sections */}
      <nav className="flex w-[52px] shrink-0 flex-col items-center border-r border-[var(--hairline)] py-2 gap-0.5">
        {GROUPS.map((group, gi) => (
          <div key={group.label} className="flex w-full flex-col items-center">
            {gi > 0 && <div className="mx-auto mb-1 mt-1.5 h-px w-[26px] bg-[var(--hairline)]" />}
            <span className="mb-0.5 text-[6.5px] font-bold tracking-[0.12em] text-[var(--ink-faint)]">{group.label}</span>
            {group.ids.map((id) => {
              const tab = TAB_BY_ID[id];
              const active = activeTab === id;
              const b = badge?.[id];
              const isOps = group.label === "OPS";
              return (
                <button
                  key={id}
                  onClick={() => onTabChange(id)}
                  title={tab.label}
                  className={`relative mb-0.5 flex items-center justify-center rounded-lg transition-all duration-200
                    ${isOps ? "h-[30px] w-[34px] scale-95 opacity-70 hover:opacity-100" : "h-[36px] w-[38px]"}
                    ${active
                      ? "bg-[var(--brand-soft)] text-[var(--brand)] shadow-[0_0_12px_rgba(232,101,42,0.08)] opacity-100 scale-100"
                      : "text-[var(--ink-dim)] hover:bg-[rgba(140,160,200,0.06)] hover:text-[var(--ink)]"
                    }`}
                >
                  {tab.icon}
                  {b != null && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-[var(--danger-hot)] px-[3px] text-[7px] font-bold text-white">
                      {b}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Content area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
});

/* ═══ Content header — used by each dashboard ═══ */
export function DashHeader({ title, subtitle, right }: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--hairline)] px-5 py-3">
      <div>
        <h2 className="display text-[13px] font-semibold tracking-[0.12em] text-[var(--ink-bright)]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-[10px] text-[var(--ink-dim)]">{subtitle}</p>
        )}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

/* ═══ Metric card — reusable KPI display ═══ */
export function MetricCard({ label, value, unit, trend, color, sub }: {
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "flat";
  color?: string;
  sub?: string;
}) {
  const trendArrow = trend === "up" ? "↑" : trend === "down" ? "↓" : trend === "flat" ? "→" : "";
  const trendClass = trend === "up" ? "trend-up" : trend === "down" ? "trend-down" : "trend-flat";
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--bg-inset)] px-4 py-3">
      <div className="label-caps mb-1.5" style={{ fontSize: 8 }}>{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="display text-[22px] font-bold tabular-nums" style={{ color: color ?? "var(--ink-bright)" }}>
          {value}
        </span>
        {unit && <span className="text-[10px] text-[var(--ink-dim)]">{unit}</span>}
        {trendArrow && (
          <span className={`text-[13px] font-bold ${trendClass}`}>{trendArrow}</span>
        )}
      </div>
      {sub && <div className="mt-1 text-[9px] text-[var(--ink-faint)]">{sub}</div>}
    </div>
  );
}

/* ═══ Status pill ═══ */
export function StatusPill({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    idle: { bg: "rgba(140,160,200,0.08)", fg: "var(--ink-dim)" },
    en_route: { bg: "rgba(59,125,216,0.10)", fg: "#5ba0e8" },
    loading: { bg: "rgba(232,101,42,0.10)", fg: "var(--brand)" },
    unloading: { bg: "rgba(22,163,74,0.10)", fg: "var(--ok)" },
    shuttling: { bg: "rgba(167,139,250,0.10)", fg: "#a78bfa" },
    returning: { bg: "rgba(56,189,248,0.10)", fg: "#38bdf8" },
    open: { bg: "rgba(22,163,74,0.10)", fg: "var(--ok)" },
    blocked: { bg: "rgba(217,119,6,0.10)", fg: "var(--danger)" },
    destroyed: { bg: "rgba(220,38,38,0.10)", fg: "var(--danger-hot)" },
    online: { bg: "rgba(22,163,74,0.10)", fg: "var(--ok)" },
    offline: { bg: "rgba(220,38,38,0.10)", fg: "var(--danger-hot)" },
    degraded: { bg: "rgba(217,119,6,0.10)", fg: "var(--danger)" },
    operational: { bg: "rgba(22,163,74,0.10)", fg: "var(--ok)" },
    failed: { bg: "rgba(220,38,38,0.10)", fg: "var(--danger-hot)" },
  };
  const c = colors[status] ?? colors.idle;
  const px = size === "md" ? "px-2.5 py-1 text-[10px]" : "px-2 py-0.5 text-[9px]";
  return (
    <span className={`pill font-semibold ${px}`}
      style={{ background: c.bg, color: c.fg }}>
      {status.replace(/_/g, " ").toUpperCase()}
    </span>
  );
}

/* ═══ Progress bar ═══ */
export function ProgressBar({ value, max = 100, color = "var(--brand)", height = 4 }: {
  value: number; max?: number; color?: string; height?: number;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, background: "rgba(140,160,200,0.08)" }}>
      <div className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
