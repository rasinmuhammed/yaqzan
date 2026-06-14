import { memo, useState, useEffect, useRef } from "react";
import type { Snapshot } from "../../types";
import { DashHeader } from "../Sidebar";

/* ═══════════════════════════════════════════════════════════════════
   INCIDENT REPORTS — Citizen → AI Triage → Authority → Action
   When a user submits a report, K2 runs a live simulated triage
   and the response streams in token by token.
   ═══════════════════════════════════════════════════════════════════ */

interface Directive {
  id: string; action: string; target: string;
  params: Record<string, unknown>; rationale: string; urgency: string;
}
interface Report {
  id: string;
  time: string;
  reporter: string;
  location: string;
  type: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "pending" | "triaging" | "verified" | "escalated" | "resolved" | "rejected";
  aiTriage: string;
  authorityNote?: string;
  // Live agent fields (citizen -> K2 rescue loop).
  reasoning?: string;
  citizenInstruction?: string;
  instructionCorrected?: boolean;
  directive?: Directive | null;
  verified?: boolean;
  rejectionReason?: string | null;
  opApplied?: boolean;
  duplicateOf?: string | null;
}

const REPORT_TYPES = [
  "Flooding", "Building Collapse", "Fire", "Chemical Spill",
  "Road Blocked", "Medical Emergency", "Power Outage", "Stranded People",
  "Infrastructure Damage", "Other",
];

const TYPE_ICONS: Record<string, string> = {
  "Flooding": "M3 17l3-6 3 3 4-7 3 4 3-2",
  "Building Collapse": "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  "Fire": "M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z",
  "Chemical Spill": "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18",
  "Road Blocked": "M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z",
  "Medical Emergency": "M12 2v20M2 12h20",
  "Power Outage": "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  "Stranded People": "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75",
  "Infrastructure Damage": "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z",
  "Other": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
};

// Simulated AI triage responses based on report type + location
const AI_TRIAGE_TEMPLATES: Record<string, (loc: string, desc: string) => string> = {
  "Flooding": (loc, _desc) => `Cross-referencing flood sensor network — ${loc} shows elevated water readings consistent with report. Checking district population density and road access. If water depth exceeds 1.5m at ${loc}, evacuation priority escalates to CRITICAL. Verifying nearest shelter node capacity and rescue team availability. RECOMMENDATION: dispatch rt_nearest if depth confirmed.`,
  "Medical Emergency": (loc, _desc) => `Checking ambulance fleet position relative to ${loc}. Evaluating road passability on all routes to Vandanam Medical College and the Thiruvalla hospitals. If roads are blocked, assessing boat transfer and helicopter landing zones. Patient priority classified HIGH. Dispatching closest available ambulance with open route. Alerting receiving hospital.`,
  "Chemical Spill": (loc, _desc) => `Matching against industrial inject log — checking for known hazmat events near ${loc}. Calculating wind direction and contamination radius. Recommending 300m evacuation perimeter. Civil Defense notified. Hazmat unit dispatched. Neighboring districts put on standby alert.`,
  "Stranded People": (loc, _desc) => `Analyzing ${loc} accessibility — checking if any road remains passable. Counting reported stranded persons to match with available rescue capacity. Evaluating boat deployment if roads fully blocked. Shelter node identified. Escalating to rescue coordinator with person count and mobility constraints.`,
  "Road Blocked": (loc, _desc) => `Checking road network graph for ${loc} — verifying if already flagged as impassable in simulation model. If duplicate: marking as confirmed data point, no new dispatch needed. If new: rerouting active vehicles avoiding this segment. Issuing updated route advisory to all units in area.`,
  "Fire": (loc, _desc) => `Checking ${loc} for industrial or residential context. Civil Defense alert sent. Assessing wind speed and neighboring structures for spread risk. Power isolation recommended for affected block. Nearest fire unit dispatched. Population within 500m placed on evacuation advisory.`,
  "Power Outage": (loc, _desc) => `Cross-referencing power grid model for ${loc}. Identifying if this is generator failure, grid cascade, or infrastructure damage. Backup generator nodes checked. Hospitals and emergency shelters on ${loc} power circuit prioritized for restoration. Utility team alerted.`,
  "Building Collapse": (loc, _desc) => `${loc} flagged PRIORITY 1. Urban search and rescue dispatched. Checking structural reports and last inspection data. Perimeter establishment recommended — 50m exclusion zone. Secondary collapse risk elevated. Ambulances pre-positioned at safe standoff distance.`,
  "Infrastructure Damage": (loc, _desc) => `Evaluating ${loc} infrastructure damage report against sensor telemetry. Structural integrity team alerted. Checking if damage affects evacuation routes or utility corridors. Road closures updated in route planning system. Civil engineering assessment dispatched.`,
  "Other": (loc, _desc) => `Report logged from ${loc}. Initial classification: unspecified. Cross-checking against all active incident layers — flood, power, road, medical. Manual review initiated. Authority notified for verification. Will escalate upon confirmation.`,
};

const AUTO_SEVERITY = (type: string, desc: string): "critical" | "high" | "medium" | "low" => {
  const lower = desc.toLowerCase();
  if (type === "Medical Emergency" || type === "Building Collapse") return "critical";
  if (lower.includes("critical") || lower.includes("dying") || lower.includes("trapped") || lower.includes("unconscious")) return "critical";
  if (lower.includes("urgent") || lower.includes("danger") || lower.includes("many people") || lower.includes("children")) return "high";
  if (type === "Flooding" || type === "Chemical Spill" || type === "Fire") return "high";
  if (type === "Road Blocked" || type === "Power Outage") return "medium";
  return "medium";
};

const DEMO_REPORTS: Report[] = [
  {
    id: "RPT-001", time: "14:23", reporter: "Biju P.", location: "Champakulam",
    type: "Flooding", description: "Water rising fast through the paddy polder. Ground floors submerged. Around 40 people sheltering on rooftops near the boat jetty.",
    severity: "critical", status: "escalated",
    aiTriage: "Confirmed via flood sensors — Champakulam water at 2.1m, polder sits ~2m below sea level. Matches 911 call cluster. ESCALATED: boat_3 dispatched from Nedumudy.",
    citizenInstruction: "Move everyone to the highest floor or the rooftop now. Do not enter the water. Tie a bright cloth where rescuers can see it and keep one phone on.",
  },
  {
    id: "RPT-002", time: "14:31", reporter: "Suja R.", location: "Punnapra",
    type: "Chemical Spill", description: "Strong diesel and sewage smell in the floodwater near the coast road. People feeling nauseous.",
    severity: "high", status: "verified",
    aiTriage: "Cross-referenced with inject #fuel_slick — diesel and sewage contamination at Punnapra confirmed. Contamination zone active. Routing evacuees away from this node.",
    authorityNote: "Verified by District Disaster Management. Pollution control team en route.",
  },
  {
    id: "RPT-003", time: "14:45", reporter: "Thomas K.", location: "Edathua",
    type: "Stranded People", description: "Elderly care home residents unable to evacuate. 15 elderly, 3 wheelchair-bound. Water at the doorstep, no road transport.",
    severity: "critical", status: "escalated",
    aiTriage: "Edathua is a relief-camp node with capacity. Mobility-limited group needs boats, not buses. boat_4 is closest at 1 edge. PRIORITY ESCALATION issued.",
  },
  {
    id: "RPT-004", time: "15:02", reporter: "Rajesh N.", location: "Pandanad",
    type: "Road Blocked", description: "The approach bridge at Pandanad is under water. Two vehicles stuck on the ramp.",
    severity: "medium", status: "resolved",
    aiTriage: "Pandanad bridge already flagged impassable at t14 (inject #pandanad_bridge). Consistent with flood model. Marking as confirmed duplicate.",
    authorityNote: "Road already closed by police. Vehicles evacuated.",
  },
  {
    id: "RPT-005", time: "15:18", reporter: "Anitha S.", location: "Kainakary",
    type: "Medical Emergency", description: "Pregnant woman in labour, cannot reach hospital. All roads flooded.",
    severity: "critical", status: "pending",
    aiTriage: "Kainakary is cut off by road (lowest polder, -2.2m). Boat transfer to Vandanam Medical College via Nedumudy is the only open route. Assessing boat_2 availability...",
    citizenInstruction: "Keep her warm, dry and calm and do not move her into the water. A boat is being routed via Nedumudy; signal from the roof when you hear the engine.",
  },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "var(--ink-faint)",
  triaging: "var(--water)",
  verified: "var(--water)",
  escalated: "var(--brand)",
  resolved: "var(--ok)",
  rejected: "var(--danger)",
};

const SEV_COLORS: Record<string, string> = {
  critical: "var(--danger-hot)",
  high: "var(--danger)",
  medium: "var(--water)",
  low: "var(--ink-dim)",
};

function SvgIcon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/* ── The agent's recommended rescue operation, grounded and verifier-checked ── */
function RescueOpCard({ report: r, send }: { report: Report; send: (m: Record<string, unknown>) => void }) {
  const d = r.directive!;
  const units = (d.params?.using as string[] | undefined) ?? [];
  const to = d.params?.to as string | undefined;
  const ok = r.verified;
  return (
    <div className="rounded-lg border px-3 py-3"
      style={{ borderColor: ok ? "var(--ok)" : "rgba(220,38,38,0.3)",
        background: ok ? "rgba(22,163,74,0.05)" : "rgba(220,38,38,0.04)" }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[8px] font-bold tracking-[0.15em]" style={{ color: ok ? "var(--ok)" : "var(--danger-hot)" }}>
          RECOMMENDED RESCUE OPERATION
        </span>
        <span className="pill px-1.5 py-[1px] text-[7.5px] font-bold uppercase"
          style={{ background: ok ? "var(--ok-dim)" : "rgba(220,38,38,0.1)", color: ok ? "var(--ok)" : "var(--danger-hot)" }}>
          {ok ? "verifier ok" : "verifier blocked"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="display font-bold tracking-wide text-[var(--ink-bright)]">{d.action.replace(/_/g, " ").toUpperCase()}</span>
        <span className="chat-unit">{d.target}</span>
        {to && (<><span className="text-[var(--ink-faint)]">→</span><span className="chat-unit">{to}</span></>)}
        {units.map((u) => <span key={u} className="chat-unit">{u}</span>)}
      </div>
      {d.rationale && <div className="mt-1.5 text-[10px] leading-relaxed text-[var(--ink-dim)]">{d.rationale}</div>}
      {!ok && r.rejectionReason && (
        <div className="mt-1.5 text-[9.5px] text-[var(--danger-hot)]">Blocked: {r.rejectionReason}</div>
      )}
      <div className="mt-2.5">
        {r.opApplied ? (
          <span className="flex items-center gap-1.5 text-[9px] font-bold tracking-wider text-[var(--ok)]">
            <span className="h-[5px] w-[5px] animate-pulse rounded-full bg-[var(--ok)]" /> DISPATCHED
          </span>
        ) : ok ? (
          <button
            onClick={(e) => { e.stopPropagation(); send({ cmd: "accept_report_op", report_id: r.id }); }}
            className="pill border border-[var(--ok)] bg-[var(--ok-dim)] px-3.5 py-1.5 text-[9px] font-bold tracking-wider text-[var(--ok)] transition-colors hover:bg-[var(--ok)] hover:text-white"
          >
            APPROVE & DISPATCH
          </button>
        ) : (
          <span className="text-[9px] text-[var(--ink-faint)]">No safe action approved automatically. Operator review required.</span>
        )}
      </div>
    </div>
  );
}

/* ── Streaming triage text component ── */
function StreamingText({ text, onDone }: { text: string; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState("");
  const idx = useRef(0);

  useEffect(() => {
    idx.current = 0;
    setDisplayed("");
    const iv = setInterval(() => {
      idx.current += 3;
      if (idx.current >= text.length) {
        setDisplayed(text);
        clearInterval(iv);
        onDone?.();
      } else {
        setDisplayed(text.slice(0, idx.current));
      }
    }, 18);
    return () => clearInterval(iv);
  }, [text]);

  return (
    <span className="text-[11px] leading-relaxed text-[var(--ink-dim)]">
      {displayed}
      {displayed.length < text.length && (
        <span className="inline-block w-[2px] h-[12px] bg-[var(--brand)] ml-0.5 animate-pulse align-middle" />
      )}
    </span>
  );
}

export const ReportsDash = memo(function ReportsDash({
  snapshot,
  send,
  openSignal = 0,
}: {
  snapshot: Snapshot | null;
  send: (msg: Record<string, unknown>) => void;
  openSignal?: number;
}) {
  const [reports, setReports] = useState<Report[]>(DEMO_REPORTS);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [newReportId, setNewReportId] = useState<string | null>(null);

  // Live agent stream: incoming report, its reasoning, the verified op, and dispatch.
  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent).detail;
      if (m.type === "citizen_report") {
        const rp = m.report; const now = new Date();
        const isDup = !!rp.duplicate_of;
        setReports((prev) => prev.some((r) => r.id === rp.id) ? prev : [{
          id: rp.id,
          time: `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`,
          reporter: rp.reporter || "Anonymous", location: rp.location,
          type: rp.type, description: rp.description,
          severity: AUTO_SEVERITY(rp.type || "", rp.description || ""),
          status: isDup ? "resolved" : "triaging", aiTriage: "", reasoning: "",
          duplicateOf: rp.duplicate_of ?? null,
        }, ...prev]);
        setNewReportId(rp.id);
      } else if (m.type === "report_duplicate") {
        setReports((prev) => prev.map((r) => r.id === m.id ? { ...r, duplicateOf: m.of, status: "resolved" } : r));
      } else if (m.type === "report_reasoning") {
        setReports((prev) => prev.map((r) => r.id === m.id
          ? { ...r, reasoning: (r.reasoning || "") + m.text, status: "triaging" } : r));
      } else if (m.type === "report_response") {
        setReports((prev) => prev.map((r) => r.id === m.id ? {
          ...r, aiTriage: m.triage || r.aiTriage, directive: m.directive,
          citizenInstruction: m.citizen_instruction, instructionCorrected: m.instruction_corrected,
          verified: m.verified, rejectionReason: m.rejection_reason,
          status: m.directive ? (m.verified ? "verified" : "pending") : "pending",
        } : r));
      } else if (m.type === "report_op_applied") {
        setReports((prev) => prev.map((r) => r.id === m.id
          ? { ...r, opApplied: true, status: "resolved", authorityNote: "Rescue operation dispatched by operator." } : r));
      }
    };
    window.addEventListener("yaqzan_ws", handler);
    return () => window.removeEventListener("yaqzan_ws", handler);
  }, []);

  const stats = [
    { label: "Total", value: reports.length, color: "var(--ink-bright)" },
    { label: "Pending", value: reports.filter(r => r.status === "pending" || r.status === "triaging").length, color: "var(--ink-faint)" },
    { label: "Escalated", value: reports.filter(r => r.status === "escalated").length, color: "var(--brand)" },
    { label: "Resolved", value: reports.filter(r => r.status === "resolved").length, color: "var(--ok)" },
  ];

  return (
    <div className="flex h-full flex-col">
      <DashHeader
        title="INCIDENT REPORTS"
        subtitle="Citizen report → K2 triage → Authority → Action"
        right={
          <></>
        }
      />

      <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* ─── Chain Flow Visualization ─── */}
        <div className="flex items-center justify-between rounded-xl border border-[var(--hairline)] bg-[var(--bg-inset)] px-4 py-3">
          {[
            { label: "Citizen", sub: "Reports incident" },
            { label: "K2 Triage", sub: "AI analysis" },
            { label: "Authority", sub: "Verification" },
            { label: "Escalate", sub: "Command cycle" },
            { label: "Action", sub: "Units dispatched" },
          ].map((step, i) => (
            <div key={step.label} className="flex items-center gap-2">
              {i > 0 && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
              <div className="text-center">
                <div className="text-[10px] font-semibold text-[var(--ink-bright)]">{step.label}</div>
                <div className="text-[8px] text-[var(--ink-faint)]">{step.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ─── Stats ─── */}
        <div className="grid grid-cols-4 gap-2">
          {stats.map(s => (
            <div key={s.label} className="rounded-xl border border-[var(--hairline)] bg-[var(--bg-inset)] px-3 py-3 text-center">
              <div className="text-[22px] font-bold tabular-nums" style={{ color: s.color, fontFamily: "'Outfit', sans-serif" }}>{s.value}</div>
              <div className="text-[8px] text-[var(--ink-faint)] tracking-wide uppercase mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>


        {/* ─── Report List ─── */}
        <div className="space-y-2">
          {reports.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border bg-[var(--bg-inset)] transition-all cursor-pointer ${
                selectedReport?.id === r.id ? "border-[var(--brand-line)]" : "border-[var(--hairline)] hover:border-[var(--hairline-active)]"
              }`}
              onClick={() => setSelectedReport(selectedReport?.id === r.id ? null : r)}
            >
              {/* Card header */}
              <div className="px-4 pt-3 pb-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="mono text-[9px] text-[var(--ink-faint)]">{r.id}</span>
                  <span className="text-[9px] text-[var(--ink-faint)]">{r.time}</span>
                  <span className="pill px-1.5 py-[1px] text-[7px] font-bold" style={{ background: `${SEV_COLORS[r.severity]}18`, color: SEV_COLORS[r.severity] }}>
                    {r.severity.toUpperCase()}
                  </span>
                  <span className="pill px-1.5 py-[1px] text-[7px] font-bold" style={{ background: `${STATUS_COLORS[r.status]}18`, color: STATUS_COLORS[r.status] }}>
                    {r.status === "triaging" ? "K2 TRIAGING..." : r.status.toUpperCase()}
                  </span>
                  <span className="ml-auto flex items-center gap-1 text-[9px] text-[var(--ink-dim)]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 7a3 3 0 100 6 3 3 0 000-6z" />
                    </svg>
                    {r.location}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 text-[var(--ink-faint)] shrink-0">
                    <SvgIcon d={TYPE_ICONS[r.type] ?? TYPE_ICONS["Other"]} size={13} />
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-[var(--ink-bright)]">{r.type}</span>
                    <span className="text-[10px] text-[var(--ink-dim)] ml-1.5">{r.description.slice(0, 90)}{r.description.length > 90 ? "…" : ""}</span>
                  </div>
                </div>
                <div className="mt-1 text-[9px] text-[var(--ink-faint)]">Reported by {r.reporter}</div>
              </div>

              {/* ─── Expanded panel ─── */}
              {selectedReport?.id === r.id && (
                <div className="border-t border-[var(--hairline)] px-4 py-3 space-y-3">

                  {/* Deduplication — the documented failure of the 2018 crowdsourced effort */}
                  {r.duplicateOf ? (
                    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--hairline)] bg-[var(--bg-inset)] px-3.5 py-3">
                      <span className="flex h-[20px] w-[20px] items-center justify-center rounded-md bg-[var(--bg-raised)] text-[var(--ink-dim)]">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>
                      </span>
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-[var(--ink-bright)]">Merged — duplicate of <span className="chat-unit">{r.duplicateOf}</span></div>
                        <div className="text-[9px] text-[var(--ink-dim)]">Same place and incident already triaged. No new dispatch, no wasted response — the gap that drowned the 2018 effort.</div>
                      </div>
                    </div>
                  ) : (<>

                  {/* Immediate guidance sent back to the reporter — the public-facing value */}
                  {r.citizenInstruction && (
                    <div className="overflow-hidden rounded-xl border border-[var(--ok)]" style={{ background: "linear-gradient(180deg, rgba(16,185,129,0.10), rgba(16,185,129,0.03))" }}>
                      <div className="flex items-center gap-2 border-b border-[rgba(16,185,129,0.18)] px-3 py-2">
                        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-md bg-[rgba(16,185,129,0.16)] text-[var(--ok)]">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                        </span>
                        <span className="text-[9px] font-bold tracking-[0.14em] text-[var(--ok)]">INSTRUCTION SENT TO REPORTER</span>
                        <span className="ml-auto flex items-center gap-1 text-[8px] text-[var(--ink-faint)]">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4M12 3l7 3v6c0 4-3 7-7 8-4-1-7-4-7-8V6z" /></svg>
                          safety-checked
                        </span>
                      </div>
                      <div className="px-3.5 py-2.5 text-[12px] font-medium leading-relaxed text-[var(--ink-bright)]">
                        {r.citizenInstruction}
                        {r.instructionCorrected && (
                          <span className="mt-1 block text-[9px] font-normal text-[var(--ink-faint)]">Adjusted by the safety checker to vetted guidance.</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* K2 AI Triage block */}
                  <div className="rounded-xl border border-[var(--brand-line)] bg-[var(--brand-soft)]/20 px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex h-[24px] w-[24px] items-center justify-center rounded-md bg-[var(--brand-soft)]">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
                          <path d="M9 18h6 M10 22h4 M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
                        </svg>
                      </div>
                      <span className="text-[10px] font-bold tracking-[0.15em] text-[var(--brand)]">K2 TRIAGE ANALYSIS</span>
                      {r.status === "triaging" && (
                        <span className="flex items-center gap-1 text-[8px] text-[var(--water)]">
                          <span className="inline-block h-[5px] w-[5px] rounded-full bg-[var(--water)] animate-pulse" />
                          LIVE
                        </span>
                      )}
                    </div>
                    {r.reasoning && (
                      <div className="mb-3 rounded-lg border border-[var(--brand-line)] bg-[var(--bg-base)] px-4 py-3">
                        <div className="label-caps mb-2 flex items-center gap-1.5" style={{ fontSize: 8 }}>
                          <span className={`h-[5px] w-[5px] rounded-full bg-[var(--brand)] ${r.status === "triaging" ? "animate-pulse" : ""}`} />
                          Agent reasoning {r.status === "triaging" ? "· live" : ""}
                        </div>
                        <div className="mono scroll-thin max-h-[140px] overflow-y-auto whitespace-pre-wrap text-[10px] leading-loose text-[var(--ink-dim)]">
                          {r.reasoning.replace(/<\/?think>/gi, "").trimStart()}
                        </div>
                      </div>
                    )}
                    {r.aiTriage && (r.id === newReportId ? (
                      <div className="text-[13px] leading-relaxed text-[var(--ink-bright)]"><StreamingText text={r.aiTriage} /></div>
                    ) : (
                      <div className="text-[13px] leading-relaxed text-[var(--ink-bright)]">{r.aiTriage}</div>
                    ))}
                  </div>

                  {/* Agent's recommended rescue operation (verified, operator-approvable) */}
                  {r.directive && <RescueOpCard report={r} send={send} />}

                  {/* Authority note */}
                  {r.authorityNote && (
                    <div className="rounded-lg border border-[var(--hairline)] bg-[var(--bg-base)] px-3 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex h-[20px] w-[20px] items-center justify-center rounded-md bg-[rgba(22,163,74,0.12)]">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2">
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14 M22 4L12 14.01l-3-3" />
                          </svg>
                        </div>
                        <span className="text-[8px] font-bold tracking-[0.15em] text-[var(--ok)]">AUTHORITY VERIFICATION</span>
                      </div>
                      <div className="text-[11px] leading-relaxed text-[var(--ink-dim)]">{r.authorityNote}</div>
                    </div>
                  )}

                  {/* Action buttons for pending */}
                  {(r.status === "pending" || r.status === "triaging") && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); setReports(prev => prev.map(x => x.id === r.id ? { ...x, status: "verified", authorityNote: "Verified by command authority." } : x)); }}
                        className="flex items-center gap-1.5 pill px-3 py-1.5 text-[9px] font-bold bg-[rgba(22,163,74,0.15)] text-[var(--ok)] border border-[rgba(22,163,74,0.3)] hover:bg-[var(--ok)] hover:text-white transition-all"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                        Verify
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setReports(prev => prev.map(x => x.id === r.id ? { ...x, status: "escalated", authorityNote: "Escalated to full command cycle." } : x)); }}
                        className="flex items-center gap-1.5 pill px-3 py-1.5 text-[9px] font-bold bg-[var(--brand-soft)] text-[var(--brand)] border border-[var(--brand-line)] hover:bg-[var(--brand)] hover:text-white transition-all"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                        Escalate to Command
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setReports(prev => prev.map(x => x.id === r.id ? { ...x, status: "rejected" } : x)); }}
                        className="flex items-center gap-1.5 pill px-3 py-1.5 text-[9px] text-[var(--danger)] border border-[rgba(220,38,38,0.25)] hover:bg-[rgba(220,38,38,0.1)] transition-all"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        Reject
                      </button>
                    </div>
                  )}

                  {r.status === "escalated" && (
                    <div className="flex items-center gap-2 rounded-lg bg-[var(--brand-soft)] border border-[var(--brand-line)] px-3 py-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                      <span className="text-[10px] text-[var(--brand)] font-semibold">Injected into command cycle — K2 is factoring this into current directives</span>
                    </div>
                  )}
                  </>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
