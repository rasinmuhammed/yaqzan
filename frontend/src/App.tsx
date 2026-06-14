import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BottomStrip } from "./components/BottomStrip";
import { CinematicOverlay, StartupSplash } from "./components/CinematicOverlay";
import { LandingPage, GuidePage } from "./components/LandingPage";
import { GuidedDemo } from "./components/GuidedDemo";
import { LiveEventBar } from "./components/LiveEventBar";
import { AfterActionReport } from "./components/AfterActionReport";
import { MapPanel } from "./components/MapPanel";
import { PlanPanel } from "./components/PlanPanel";
import { ReasoningStream } from "./components/ReasoningStream";
import { Sidebar, type SidebarTab } from "./components/Sidebar";
import { OverviewDash } from "./components/dashboards/OverviewDash";
import { RoadsDash } from "./components/dashboards/RoadsDash";
import { MedicalDash } from "./components/dashboards/MedicalDash";
import { CommsDash } from "./components/dashboards/CommsDash";
import { ResourcesDash } from "./components/dashboards/ResourcesDash";
import { DistrictDash } from "./components/dashboards/DistrictDash";
import { ChatPanel } from "./components/dashboards/ChatPanel";
import { ReportsDash } from "./components/dashboards/ReportsDash";
import { SimulatorPanel } from "./components/dashboards/SimulatorPanel";
import { ReportIncidentModal } from "./components/ReportIncidentModal";
import { DisclaimerModal } from "./components/DisclaimerModal";
import { useYaqzan } from "./store";

const SEV_COLORS: Record<string, string> = {
  normal: "var(--ok)",
  elevated: "var(--danger)",
  critical: "var(--danger-hot)",
  extreme: "#ff3333",
};

import { MobileReportPage } from "./components/MobileReportPage";

export default function App() {
  const { state, dispatch, send } = useYaqzan();
  const film = useMemo(() => new URLSearchParams(location.search).has("film"), []);
  const [page, setPage] = useState<"landing" | "dashboard" | "guide">(film ? "dashboard" : "landing");
  const [showSplash, setShowSplash] = useState(film);
  const [activeTab, setActiveTab] = useState<SidebarTab>("commander");
  const [demoActive, setDemoActive] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportSeen, setReportSeen] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(!film);
  const [latestInject, setLatestInject] = useState<{
    id: string; severity: string; headline: string; tick: number;
  } | null>(null);

  // Track injects for cinematic banner.
  useEffect(() => {
    if (state.events.length > 0) {
      const last = state.events[state.events.length - 1];
      setLatestInject({
        id: `${last.tick}-${last.text.slice(0, 20)}`,
        severity: last.severity,
        headline: last.text,
        tick: last.tick,
      });
    }
  }, [state.events.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Film mode: number keys fire scenario injects on cue.
  useEffect(() => {
    if (!film || !state.city) return;
    const handler = (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= state.city!.injects.length) {
        send({ cmd: "trigger_inject", inject_id: state.city!.injects[n - 1].id });
      }
      if (e.key === " ") send({ cmd: state.running ? "pause" : "start" });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [film, state.city, state.running, send]);

  // Surface the After-Action Report once when a drill run completes (tick 60).
  const tick = state.snapshot?.tick ?? 0;
  useEffect(() => {
    if (tick >= 60 && !reportSeen && !film) { setShowReport(true); setReportSeen(true); }
    if (tick < 5 && reportSeen) { setReportSeen(false); setShowReport(false); } // new run
  }, [tick, reportSeen, film]);

  const onHover = (id: string | null) => dispatch({ t: "hover", id });
  const onSplashDone = useCallback(() => setShowSplash(false), []);

  // Map click → auto-switch to district tab
  const onDistrictClick = useCallback((id: string) => {
    setSelectedDistrict(id);
    setActiveTab("district");
  }, []);

  const sev = state.snapshot?.severity_level ?? "normal";

  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 760);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const isReportRoute = window.location.pathname === "/report";

  if (isReportRoute) {
    return <MobileReportPage />;
  }

  if (isMobile) {
    return (
      <div style={{ display: "flex", position: "fixed", inset: 0, zIndex: 9999, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 32, textAlign: "center", background: "var(--bg)" }}>
        <div style={{ fontFamily: "Outfit, sans-serif", fontSize: 20, fontWeight: 700, color: "#edf0f7" }}>YAQZAN</div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.6, color: "#6b7a94", maxWidth: 280 }}>
          The live operations room is built for a larger screen. Please open Yaqzan on a tablet or desktop for the full experience.
        </div>
      </div>
    );
  }

  if (page === "landing") {
    return (
      <LandingPage 
        onEnter={() => {
          setPage("dashboard");
          setDemoActive(true); // orient every newcomer with the guided walkthrough
          setTimeout(() => send({ cmd: "start" }), 1000);
        }}
        onGuide={() => setPage("guide")} 
      />
    );
  }

  if (page === "guide") {
    return <GuidePage onBack={() => setPage("landing")} onEnter={() => setPage("dashboard")} />;
  }

  if (showSplash) {
    return <StartupSplash cityName={state.city?.name ?? "Kuttanad, Alappuzha"} onDone={onSplashDone} />;
  }

  // Badge counts for sidebar tabs
  const badge: Partial<Record<SidebarTab, number | string>> = {};
  if (state.cycles.length > 0 && !state.cycles[state.cycles.length - 1].done) {
    badge.commander = "●";
  }
  if (state.snapshot) {
    const blocked = state.snapshot.impassable_edges.length + state.snapshot.destroyed_edges.length;
    if (blocked > 0) badge.roads = blocked;
    if (state.snapshot.telemetry.hospitals.some((h) => h.generator_failed)) badge.medical = "!";
  }

  // Render active tab content
  const renderTab = () => {
    switch (activeTab) {
      case "commander":
        return (
          <div className="flex h-full flex-col">
            {/* The readable AI briefing is the star; the raw reasoning is secondary. */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <PlanPanel
                cycles={state.cycles}
                overridden={state.overridden}
                applied={state.applied}
                authority={state.authority}
                onOverride={(cycle, id) => {
                  dispatch({ t: "override", key: `${cycle}:${id}` });
                  send({ cmd: "override_directive", cycle, directive_id: id });
                }}
                onAccept={(cycle, id) => send({ cmd: "accept_directive", cycle, directive_id: id })}
                onAcceptAll={(cycle) => send({ cmd: "accept_all", cycle })}
                onHover={onHover}
              />
            </div>
            <div className="shrink-0 border-t border-[var(--hairline)] h-[34%] min-h-0 overflow-hidden">
              <ReasoningStream cycles={state.cycles} onHover={onHover} />
            </div>
          </div>
        );
      case "overview":
        return <OverviewDash snapshot={state.snapshot} events={state.events}
          riskHistory={state.riskHistory} baselineHistory={state.baselineHistory}
          cycles={state.cycles} />;
      case "roads":
        return <RoadsDash city={state.city} snapshot={state.snapshot} onHover={onHover} />;
      case "medical":
        return <MedicalDash snapshot={state.snapshot} />;
      case "comms":
        return <CommsDash city={state.city} snapshot={state.snapshot} />;
      case "resources":
        return <ResourcesDash city={state.city} snapshot={state.snapshot} onHover={onHover} />;
      case "district":
        return <DistrictDash city={state.city} snapshot={state.snapshot}
          selectedDistrict={selectedDistrict} onSelectDistrict={setSelectedDistrict} />;
      case "chat":
        return <ChatPanel send={send} snapshot={state.snapshot} />;
      case "reports":
        return <ReportsDash snapshot={state.snapshot} send={send} />;
      case "simulator":
        return <SimulatorPanel scenarios={state.scenarios} send={send} />;
    }
  };

  return (
    <div className={`flex h-full flex-col gap-2 p-2 ${film ? "film" : ""}`}>
      {/* cinematic overlays */}
      <CinematicOverlay snapshot={state.snapshot} latestInject={latestInject} film={film} />
      {demoActive && <GuidedDemo onExit={() => setDemoActive(false)} setTab={setActiveTab} send={send} />}
      {showReport && (
        <AfterActionReport state={state} onClose={() => setShowReport(false)}
          onReset={() => { setShowReport(false); send({ cmd: "reset" }); setTimeout(() => send({ cmd: "start" }), 600); }} />
      )}
      {isReportModalOpen && (
        <ReportIncidentModal
          city={state.city}
          onClose={() => setIsReportModalOpen(false)}
          send={(msg) => {
            send(msg);
            setActiveTab("reports");
            setIsReportModalOpen(false);
          }}
        />
      )}
      {showDisclaimer && (
        <DisclaimerModal onClose={() => setShowDisclaimer(false)} />
      )}

      {/* header */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pt-1 pb-0.5">
        {!film && (
          <button onClick={() => setPage("landing")} className="text-[var(--ink-dim)] hover:text-[var(--brand)] transition-colors" title="Back to Home">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1"/></svg>
          </button>
        )}
        <img src="/yaqzan-logo.png" alt="Yaqzan" className="h-9 w-auto object-contain" style={{ filter: "brightness(1.1)" }} />
        <div className="flex items-baseline gap-3">
          <h1 className="display text-[18px] font-bold tracking-[0.2em] text-[var(--ink-bright)]">
            YAQZAN<span className="ml-2 text-[14px] font-medium text-[var(--brand)]">يقظان</span>
          </h1>
          {!film && <span className="label-caps hidden xl:inline" style={{ fontSize: 9 }}>Public reporting · AI triage · responder ops</span>}
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-2.5 gap-y-2">
          {/* Primary action: report an incident — the citizen entry point */}
          {!film && (
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="pill flex items-center gap-1.5 border border-[var(--brand)] bg-[var(--brand)] px-3 py-[5px] text-[10px] font-bold tracking-[0.06em] text-white shadow-[0_2px_10px_rgba(232,101,42,0.3)] transition-all hover:brightness-110"
              title="File a citizen incident report and watch K2 triage it live"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              REPORT INCIDENT
            </button>
          )}
          {/* Scenario selector */}
          {!film && state.scenarios.length > 1 && (
            <ScenarioSelector
              scenarios={state.scenarios}
              activeScenario={state.activeScenario || state.scenarios.find((s) => s.active)?.id || ""}
              onSelect={(id) => send({ cmd: "load_scenario", scenario: id })}
            />
          )}
          {/* Live event injector */}
          {!film && <LiveEventBar send={send} />}

          {/* Human-in-the-loop authority toggle */}
          {!film && (
            <div
              className="pill flex items-center overflow-hidden border border-[var(--hairline)]"
              title="Command authority: supervised = operator approves every directive; delegated = verified directives execute automatically with operator override"
            >
              {(["supervised", "delegated"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => send({ cmd: "set_authority", mode })}
                  className="px-2.5 py-[3px] text-[8.5px] font-bold tracking-[0.12em] transition-colors"
                  style={
                    state.authority === mode
                      ? { background: "var(--brand-soft)", color: "var(--brand)" }
                      : { color: "var(--ink-faint)" }
                  }
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          {/* Severity indicator */}
          <div className="flex items-center gap-2">
            <span
              className={`h-[7px] w-[7px] rounded-full ${sev === "extreme" || sev === "critical" ? "live-dot" : ""}`}
              style={{ background: SEV_COLORS[sev], color: SEV_COLORS[sev] }}
            />
            <span
              className="display text-[10px] font-bold tracking-[0.18em]"
              style={{ color: SEV_COLORS[sev] }}
            >
              {sev.toUpperCase()}
            </span>
          </div>
          {state.aiStats.cycles > 0 && (
            <span className="mono text-[10px] text-[var(--ink-dim)]" title="Cumulative K2 reasoning this run">
              <span style={{ color: "var(--brand)" }}>
                {state.aiStats.tokens >= 1000 ? `${(state.aiStats.tokens / 1000).toFixed(1)}k` : state.aiStats.tokens} tok
              </span>
              {" · "}{state.aiStats.directives} directives
              {state.aiStats.rejected > 0 && (
                <span style={{ color: "var(--danger-hot)" }} title="Hallucinated or unsafe directives the grounded verifier blocked"> · {state.aiStats.rejected} caught by verifier</span>
              )}
              {" · "}{(state.aiStats.latencyTotal / state.aiStats.cycles).toFixed(0)}s/decision
              {state.overridden.size > 0 && (
                <span> · {state.overridden.size} operator veto{state.overridden.size > 1 ? "es" : ""}</span>
              )}
            </span>
          )}
          {!film && (
            <span className="mono text-[10px] text-[var(--ink-dim)]">
              {state.city?.name ?? "…"} · {state.commander === "k2" ? "live reasoning" : "offline commander"}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            {state.running && (
              <span
                className="h-[5px] w-[5px] rounded-full live-dot"
                style={{ background: "var(--ok)", color: "var(--ok)" }}
              />
            )}
            {!film && (
              <button
                onClick={() => setPage("guide")}
                className="h-[22px] w-[22px] rounded-full border border-[var(--hairline)] text-[10px] font-bold text-[var(--ink-faint)] hover:text-[var(--brand)] hover:border-[var(--brand-line)] transition-colors"
                title="How to use Yaqzan"
              >
                ?
              </button>
            )}
            <span className="pill border border-[var(--brand-line)] bg-[var(--brand-soft)] px-3 py-1 text-[10px] font-semibold text-[var(--brand)]">
              K2 THINK V2 · MBZUAI
            </span>
          </div>
        </div>
      </header>

      {/* main grid: map (58%) + sidebar (42%) */}
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="panel relative min-w-0 flex-[58]">
          {state.city ? (
            <MapPanel
              city={state.city}
              snapshot={state.snapshot}
              hovered={state.hovered}
              onHover={onHover}
              intake={state.intake}
              onDistrictClick={onDistrictClick}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[12px] text-[var(--ink-dim)]">
              Loading Kuttanad…
            </div>
          )}
        </div>
        <div className="min-w-0 flex-[42]">
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} badge={badge}>
            {renderTab()}
          </Sidebar>
        </div>
      </div>


      {/* bottom strip */}
      <div className="h-[58px] shrink-0">
        <BottomStrip
          snapshot={state.snapshot}
          events={state.events}
          riskHistory={state.riskHistory}
          running={state.running}
          film={film}
          cycleCount={state.cycles.length}
          reportsTriaged={state.reportStats.triaged}
          send={send}
        />
      </div>
    </div>
  );
}

/* ═══ Scenario Selector (dropdown) ═══ */

function ScenarioSelector({
  scenarios,
  activeScenario,
  onSelect,
}: {
  scenarios: { id: string; name: string; description: string; inject_count: number }[];
  activeScenario: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const active = scenarios.find((s) => s.id === activeScenario);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="pill flex items-center gap-1.5 border border-[var(--hairline-active)] bg-[var(--bg-raised)] px-3 py-1 text-[10px] text-[var(--ink)] transition-colors hover:border-[var(--brand-line)] hover:text-[var(--brand)]"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span className="max-w-[120px] truncate">{active?.name ?? "Scenario"}</span>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1.5 w-[280px] overflow-hidden rounded-xl border border-[var(--hairline-active)]"
          style={{ background: "var(--bg-raised)", backdropFilter: "blur(16px)", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}
        >
          <div className="px-3 py-2 border-b border-[var(--hairline)]">
            <span className="label-caps" style={{ fontSize: 8 }}>Select Scenario</span>
          </div>
          {scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => { onSelect(s.id); setOpen(false); }}
              className={`w-full px-3 py-2.5 text-left transition-colors hover:bg-[var(--brand-soft)] ${
                s.id === activeScenario ? "bg-[var(--brand-soft)]" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="display text-[11px] font-semibold text-[var(--ink-bright)]">{s.name}</span>
                {s.id === activeScenario && (
                  <span className="pill bg-[var(--brand-soft)] px-1.5 py-[1px] text-[7px] font-bold text-[var(--brand)]">
                    ACTIVE
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[9.5px] leading-snug text-[var(--ink-dim)]">
                {s.description.slice(0, 100)}{s.description.length > 100 ? "…" : ""}
              </div>
              <div className="mt-1 flex gap-2 text-[8px] text-[var(--ink-faint)]">
                <span>{s.inject_count} injects</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
