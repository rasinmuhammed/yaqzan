import { useState } from "react";

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

function SvgIcon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function ReportIncidentModal({
  city,
  onClose,
  send
}: {
  city: any;
  onClose: () => void;
  send: (msg: Record<string, unknown>) => void;
}) {
  const [formData, setFormData] = useState({ location: "", type: REPORT_TYPES[0], description: "", reporter: "" });
  const [submitting, setSubmitting] = useState(false);

  const towns = city ? city.nodes.filter((n: any) => !n.id.startsWith("pump") && !n.id.startsWith("cell")).sort((a: any, b: any) => a.name.localeCompare(b.name)) : [];

  const handleSubmit = () => {
    if (!formData.location || !formData.description || submitting) return;
    setSubmitting(true);
    send({ cmd: "citizen_report", report: {
      type: formData.type, location: formData.location,
      description: formData.description, reporter: formData.reporter || "Anonymous",
    } });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border border-[var(--brand-line)] bg-[var(--bg-base)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--hairline)] px-5 py-4">
          <div className="flex items-center gap-2">
            <img src="/yaqzan-logo.png" alt="" className="h-5 w-5 object-contain" style={{ filter: "brightness(1.1)" }} />
            <div className="text-[12px] font-bold tracking-[0.15em] text-[var(--brand)]">SUBMIT INCIDENT REPORT</div>
          </div>
          <button onClick={onClose} className="text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-[var(--ink-faint)] mb-2 tracking-wide">YOUR NAME</label>
              <input
                value={formData.reporter}
                onChange={(e) => setFormData({ ...formData, reporter: e.target.value })}
                placeholder="Optional"
                className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)] px-3 py-2.5 text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--brand-line)] focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--ink-faint)] mb-2 tracking-wide">TOWN / LOCATION</label>
              <select
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)] px-3 py-2.5 text-[13px] text-[var(--ink)] focus:border-[var(--brand-line)] focus:outline-none transition-colors"
              >
                <option value="" disabled>Select a town...</option>
                {towns.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-[var(--ink-faint)] mb-2 tracking-wide">INCIDENT TYPE</label>
            <div className="flex flex-wrap gap-2">
              {REPORT_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setFormData({ ...formData, type: t })}
                  className={`flex items-center gap-1.5 pill px-3 py-1.5 text-[10px] border transition-all ${
                    formData.type === t
                      ? "border-[var(--brand-line)] bg-[var(--brand-soft)] text-[var(--brand)]"
                      : "border-[var(--hairline)] text-[var(--ink-dim)] hover:border-[var(--hairline-active)]"
                  }`}
                >
                  <SvgIcon d={TYPE_ICONS[t] ?? TYPE_ICONS["Other"]} size={12} />
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-[var(--ink-faint)] mb-2 tracking-wide">DESCRIPTION</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What is happening? Are people trapped? Is the water rising?"
              rows={3}
              className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--bg-inset)] px-3 py-2 text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--brand-line)] focus:outline-none transition-colors resize-none"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!formData.location || !formData.description || submitting}
            className="w-full rounded-lg border border-[var(--brand)] bg-[var(--brand)] py-2.5 text-[11px] font-bold tracking-[0.06em] text-white shadow-[0_2px_10px_rgba(232,101,42,0.3)] transition-all hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
          >
            {submitting ? "SUBMITTING..." : "SUBMIT REPORT"}
          </button>
        </div>
      </div>
    </div>
  );
}
