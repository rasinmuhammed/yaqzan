import React from "react";

export function DisclaimerModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border border-[var(--brand-line)] bg-[var(--bg-base)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--hairline)] px-5 py-4">
          <div className="flex items-center gap-2">
            <img src="/yaqzan-logo.png" alt="Yaqzan" className="h-5 w-auto object-contain" style={{ filter: "brightness(1.1)" }} />
            <div className="text-[12px] font-bold tracking-[0.15em] text-[var(--brand)]">PRE-COMPUTED DEMO</div>
          </div>
        </div>

        <div className="px-5 py-5 space-y-4 text-[13px] leading-relaxed text-[var(--ink)]">
          <p>
            Welcome to Yaqzan. Because the deterministic physics engine and deep-reasoning K2 AI take significant time to compute over real elevation data, you are currently viewing a <strong>pre-computed scenario run</strong>.
          </p>
          <p>
            The map is already flooded and the AI Commander's macro-strategy is visible in the left sidebar.
          </p>
          <p>
            <strong>To test the system:</strong>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-[var(--ink-dim)]">
              <li>Click <strong>Report Incident</strong> in the top right to instantly trigger the tactical AI triage agent on the live map.</li>
              <li>Click the <strong>Reset</strong> button in the bottom left to clear the pre-computed run and watch the disaster simulate from Tick 0.</li>
            </ul>
          </p>
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--hairline)] bg-[var(--bg-inset)] px-5 py-4 rounded-b-xl">
          <button
            onClick={onClose}
            className="flex h-8 items-center justify-center rounded bg-[var(--brand)] px-6 text-[12px] font-bold tracking-wide text-black hover:bg-white transition-colors"
          >
            UNDERSTOOD, ENTER
          </button>
        </div>
      </div>
    </div>
  );
}
