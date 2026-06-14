import { useState, useEffect } from "react";
import { ReportIncidentModal } from "./ReportIncidentModal";
import { useYaqzan } from "../store";

export function MobileReportPage() {
  const { state, send } = useYaqzan();
  const [status, setStatus] = useState<"form" | "submitting" | "success">("form");
  const [instruction, setInstruction] = useState<string>("");

  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent).detail;
      if (m.type === "report_response") {
        setInstruction(m.citizen_instruction || "Your report has been logged. Emergency services have been notified.");
        setStatus("success");
      }
    };
    window.addEventListener("yaqzan_ws", handler);
    return () => window.removeEventListener("yaqzan_ws", handler);
  }, []);

  if (status === "success") {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[var(--bg)] p-6 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ok-dim)] border border-[var(--ok)]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h2 className="mb-4 font-outfit text-2xl font-bold text-[var(--ink-bright)]">Report Received</h2>
        <div className="rounded-xl border border-[var(--brand-line)] bg-[var(--bg-inset)] p-5 text-left shadow-lg">
          <p className="mb-3 text-[11px] font-bold tracking-widest text-[var(--brand)] uppercase">
            Message from Incident Command
          </p>
          <p className="text-[15px] leading-relaxed text-[var(--ink)]">
            {instruction}
          </p>
        </div>
        <button
          onClick={() => { setStatus("form"); setInstruction(""); }}
          className="mt-8 rounded-lg border border-[var(--hairline)] bg-transparent px-6 py-3 text-[13px] font-semibold text-[var(--ink-dim)] transition-colors hover:bg-[var(--bg-raised)]"
        >
          Submit Another Report
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[var(--bg)] overflow-y-auto" style={{ position: "fixed", inset: 0 }}>
      {/* We reuse the modal's contents but hook its submit differently, or just let it send and we wait. */}
      {/* Wait, the modal has its own `submitting` state. But that's fine, we will intercept the ws event. */}
      {status === "submitting" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg)]/80 backdrop-blur-sm">
           <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-soft)] border-t-[var(--brand)] mb-4" />
           <div className="text-[13px] font-semibold tracking-wider text-[var(--brand)] uppercase animate-pulse">Contacting AI Triage...</div>
        </div>
      )}
      <ReportIncidentModal 
        city={state.city} 
        onClose={() => {}} // don't close, wait for ws response
        send={(msg) => {
          setStatus("submitting");
          send(msg);
        }} 
      />
    </div>
  );
}
